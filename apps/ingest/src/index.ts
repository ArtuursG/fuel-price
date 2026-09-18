import { Hono } from "hono";
import {
	IngestBatchSchema,
	decidePriceUpdate,
	isTimestampFresh,
	localDate,
	verifySignature,
} from "./ingest-logic";

type Bindings = {
	DB: D1Database;
	INGEST_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => c.json({ ok: true, service: "fuel-price-ingest" }));

// NOTE ON TEST COVERAGE: the logic this route calls (signature verification,
// timestamp freshness, zod validation, the price-change decision) is unit
// tested in ingest-logic.test.ts, which runs everywhere including locally.
// This route handler's own D1 reads/writes are NOT locally testable on this
// machine -- @cloudflare/vitest-pool-workers and `wrangler dev` both need
// the `workerd` binary, which is blocked here by a Windows Application
// Control policy (see docs/DECISIONS.md ADR-008, kept locally). The SQL below
// has been reasoned through carefully and matches db/migrations/0001_init.sql,
// but real verification needs either a machine without that block, or a
// live deploy. EV tariffs are validated but not yet persisted -- no EV
// source exists before Phase 6, so there's nothing to design that logic
// against yet.
app.post("/ingest", async (c) => {
	const timestamp = c.req.header("X-Cenas-Timestamp");
	const signature = c.req.header("X-Cenas-Signature");
	if (!timestamp || !signature) {
		return c.json({ error: "missing_signature_headers" }, 401);
	}
	if (!isTimestampFresh(timestamp)) {
		return c.json({ error: "timestamp_out_of_range" }, 401);
	}

	const rawBody = await c.req.text();
	const valid = await verifySignature(c.env.INGEST_SECRET, timestamp, rawBody, signature);
	if (!valid) {
		return c.json({ error: "invalid_signature" }, 401);
	}

	let payload: unknown;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return c.json({ error: "invalid_json" }, 400);
	}

	const parsed = IngestBatchSchema.safeParse(payload);
	if (!parsed.success) {
		return c.json({ error: "invalid_schema", details: parsed.error.flatten() }, 400);
	}
	const batch = parsed.data;

	// Idempotence: a resend of the exact same run (source_id + started_at +
	// content hash) is a no-op, not a duplicate insert.
	if (batch.run.content_sha256) {
		const existing = await c.env.DB.prepare(
			"SELECT id FROM scrape_runs WHERE source_id = ? AND started_at = ? AND content_sha256 = ?",
		)
			.bind(batch.run.source_id, batch.run.started_at, batch.run.content_sha256)
			.first();
		if (existing) {
			return c.json({ ok: true, idempotent: true });
		}
	}

	const runInsert = await c.env.DB.prepare(
		`INSERT INTO scrape_runs
			(source_id, started_at, finished_at, status, http_status, items, content_sha256, parser_version, error)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			batch.run.source_id,
			batch.run.started_at,
			batch.run.finished_at ?? null,
			batch.run.status,
			batch.run.http_status ?? null,
			batch.run.items,
			batch.run.content_sha256 ?? null,
			batch.run.parser_version ?? null,
			batch.run.error ?? null,
		)
		.run();
	const runId = runInsert.meta.last_row_id;

	const observedAt = new Date().toISOString();
	const today = localDate(new Date());
	const writes: D1PreparedStatement[] = [];

	for (const price of batch.fuel) {
		const last = await c.env.DB.prepare(
			`SELECT price_milli FROM fuel_prices
			 WHERE network_id = ? AND scope = ? AND product = ?
			 ORDER BY observed_at DESC LIMIT 1`,
		)
			.bind(price.network_id, price.scope, price.product)
			.first<{ price_milli: number }>();

		const decision = decidePriceUpdate(last?.price_milli ?? null, price.price_milli);
		if (decision.action === "no_change") continue;

		writes.push(
			c.env.DB.prepare(
				`INSERT INTO fuel_prices
					(network_id, scope, station_id, product, price_milli, where_text, valid_from, observed_at, local_date, run_id, flags)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				price.network_id,
				price.scope,
				price.station_id ?? null,
				price.product,
				price.price_milli,
				price.where_text ?? null,
				price.valid_from ?? null,
				observedAt,
				today,
				runId,
				decision.flags,
			),
		);
	}

	if (writes.length > 0) {
		await c.env.DB.batch(writes);
	}

	return c.json({ ok: true, run_id: runId, fuel_changed: writes.length });
});

export default app;
