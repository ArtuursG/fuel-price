import { describe, expect, it } from "vitest";
import app from "./index";

describe("GET /", () => {
  it("reports ok", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "fuel-price-ingest" });
  });
});

describe("POST /ingest", () => {
  it("is not implemented yet (Phase 3 adds HMAC + zod + D1 writes)", async () => {
    const res = await app.request("/ingest", { method: "POST" });
    expect(res.status).toBe(501);
  });
});
