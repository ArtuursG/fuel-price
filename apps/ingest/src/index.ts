import { Hono } from "hono";
import {
	IngestBatchSchema,
	computeTariffHash,
	decidePriceUpdate,
	decideTariffUpdate,
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
// live deploy.
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

	const fuelChanged = writes.length;

	for (const weekly of batch.official_weekly) {
		writes.push(
			c.env.DB.prepare(
				`INSERT INTO official_weekly (week_monday, merchant, product, avg_price_milli, source_url)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT (week_monday, merchant, product) DO UPDATE SET
					avg_price_milli = excluded.avg_price_milli,
					source_url = excluded.source_url`,
			).bind(weekly.week_monday, weekly.merchant, weekly.product, weekly.avg_price_milli, weekly.source_url),
		);
	}

	for (const station of batch.stations) {
		writes.push(
			c.env.DB.prepare(
				`INSERT INTO stations
					(id, network_id, country, name, address, city, municipality, lat, lon, osm_id, first_seen_at, last_seen_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT (id) DO UPDATE SET
					name = excluded.name,
					address = excluded.address,
					city = excluded.city,
					municipality = excluded.municipality,
					lat = excluded.lat,
					lon = excluded.lon,
					osm_id = excluded.osm_id,
					last_seen_at = excluded.last_seen_at`,
			).bind(
				station.id,
				station.network_id,
				station.country,
				station.name ?? null,
				station.address ?? null,
				station.city ?? null,
				station.municipality ?? null,
				station.lat ?? null,
				station.lon ?? null,
				station.osm_id ?? null,
				observedAt,
				observedAt,
			),
		);
	}

	// EV tariffs: change-only storage like fuel_prices (ADR-004), but the
	// "did this change" comparison is a content hash over the price-defining
	// fields (see computeTariffHash) rather than a single number. The
	// (network_id, station_id, current_type, connector, payment) tuple below
	// is a tariff "slot" -- what a price applies to.
	//
	// This reads the latest hash per slot with ONE bulk query instead of one
	// SELECT per tariff: a single EV source (e-mobi) can carry 1000+ tariffs
	// per batch, and D1 queries via the binding count against the Workers
	// per-request subrequest budget -- one per tariff would either blow past
	// that budget outright or burn through the D1 free-tier daily row-read
	// cap for no reason, since almost every run changes nothing.
	const evNetworkIds = [...new Set(batch.ev.map((t) => t.network_id))];
	const lastTariffHashes = new Map<string, string>();
	if (evNetworkIds.length > 0) {
		const placeholders = evNetworkIds.map(() => "?").join(", ");
		const { results } = await c.env.DB.prepare(
			`WITH ranked AS (
				SELECT network_id, station_id, current_type, connector, payment, tariff_hash,
				       ROW_NUMBER() OVER (
				           PARTITION BY network_id, station_id, current_type, connector, payment
				           ORDER BY observed_at DESC
				       ) AS rn
				FROM ev_tariffs
				WHERE network_id IN (${placeholders})
			)
			SELECT network_id, station_id, current_type, connector, payment, tariff_hash
			FROM ranked WHERE rn = 1`,
		)
			.bind(...evNetworkIds)
			.all<{
				network_id: string;
				station_id: string | null;
				current_type: string;
				connector: string | null;
				payment: string;
				tariff_hash: string;
			}>();
		for (const row of results) {
			const key = JSON.stringify([row.network_id, row.station_id, row.current_type, row.connector, row.payment]);
			lastTariffHashes.set(key, row.tariff_hash);
		}
	}

	let evTariffsChanged = 0;
	for (const tariff of batch.ev) {
		const hash = await computeTariffHash(tariff);
		const key = JSON.stringify([
			tariff.network_id,
			tariff.station_id ?? null,
			tariff.current_type,
			tariff.connector ?? null,
			tariff.payment,
		]);

		const decision = decideTariffUpdate(lastTariffHashes.get(key) ?? null, hash);
		if (decision.action === "no_change") continue;
		evTariffsChanged++;

		writes.push(
			c.env.DB.prepare(
				`INSERT INTO ev_tariffs
					(network_id, station_id, current_type, power_min_kw, power_max_kw, connector, payment,
					 energy_milli_per_kwh, time_milli_per_min, session_fee_milli, min_fee_milli,
					 idle_fee_milli_per_min, idle_after_min, time_from, time_to, weekdays, vat_included,
					 tariff_hash, observed_at, run_id)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				tariff.network_id,
				tariff.station_id ?? null,
				tariff.current_type,
				tariff.power_min_kw ?? null,
				tariff.power_max_kw ?? null,
				tariff.connector ?? null,
				tariff.payment,
				tariff.energy_milli_per_kwh ?? null,
				tariff.time_milli_per_min ?? null,
				tariff.session_fee_milli ?? null,
				tariff.min_fee_milli ?? null,
				tariff.idle_fee_milli_per_min ?? null,
				tariff.idle_after_min ?? null,
				tariff.time_from ?? null,
				tariff.time_to ?? null,
				tariff.weekdays ?? null,
				tariff.vat_included ? 1 : 0,
				hash,
				observedAt,
				runId,
			),
		);
	}

	// D1 caps a single batch() call at 1000 statements (e.g. a first-ever
	// e-mobi run can queue 1000+ new ev_tariffs rows alongside station
	// upserts) -- chunk to stay under that regardless of source size.
	const BATCH_CHUNK_SIZE = 500;
	for (let i = 0; i < writes.length; i += BATCH_CHUNK_SIZE) {
		await c.env.DB.batch(writes.slice(i, i + BATCH_CHUNK_SIZE));
	}

	return c.json({
		ok: true,
		run_id: runId,
		fuel_changed: fuelChanged,
		official_weekly_written: batch.official_weekly.length,
		stations_written: batch.stations.length,
		ev_tariffs_changed: evTariffsChanged,
	});
});

export default app;
