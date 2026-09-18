import { describe, expect, it } from "vitest";
import app from "./index";
import { computeSignature } from "./ingest-logic";

// These cover everything reachable BEFORE the route touches c.env.DB, using
// a fake env (no real D1 needed). The D1 read/write path itself is not
// tested here -- see the note at the top of src/index.ts for why.

describe("GET /", () => {
	it("reports ok", async () => {
		const res = await app.request("/");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, service: "fuel-price-ingest" });
	});
});

describe("POST /ingest", () => {
	const env = { INGEST_SECRET: "test-secret" };

	it("rejects a request with no signature headers", async () => {
		const res = await app.request("/ingest", { method: "POST", body: "{}" }, env);
		expect(res.status).toBe(401);
		expect((await res.json()) as { error: string }).toMatchObject({ error: "missing_signature_headers" });
	});

	it("rejects a stale timestamp", async () => {
		const body = "{}";
		const staleTimestamp = "2020-01-01T00:00:00Z";
		const signature = await computeSignature("test-secret", staleTimestamp, body);
		const res = await app.request(
			"/ingest",
			{
				method: "POST",
				body,
				headers: { "X-Cenas-Timestamp": staleTimestamp, "X-Cenas-Signature": signature },
			},
			env,
		);
		expect(res.status).toBe(401);
		expect((await res.json()) as { error: string }).toMatchObject({ error: "timestamp_out_of_range" });
	});

	it("rejects a signature that doesn't match the shared secret", async () => {
		const body = "{}";
		const timestamp = new Date().toISOString();
		const signature = await computeSignature("wrong-secret", timestamp, body);
		const res = await app.request(
			"/ingest",
			{ method: "POST", body, headers: { "X-Cenas-Timestamp": timestamp, "X-Cenas-Signature": signature } },
			env,
		);
		expect(res.status).toBe(401);
		expect((await res.json()) as { error: string }).toMatchObject({ error: "invalid_signature" });
	});

	it("rejects a validly-signed body that fails schema validation", async () => {
		const body = JSON.stringify({ run: { source_id: "x" } }); // missing started_at/status
		const timestamp = new Date().toISOString();
		const signature = await computeSignature("test-secret", timestamp, body);
		const res = await app.request(
			"/ingest",
			{ method: "POST", body, headers: { "X-Cenas-Timestamp": timestamp, "X-Cenas-Signature": signature } },
			env,
		);
		expect(res.status).toBe(400);
		expect((await res.json()) as { error: string }).toMatchObject({ error: "invalid_schema" });
	});
});
