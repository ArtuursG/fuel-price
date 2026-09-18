import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => c.json({ ok: true, service: "fuel-price-ingest" }));

// HMAC paraksts, zod validācija, scrape_runs ieraksts un D1 batch rakstīšana
// pievienoti 3. fāzē (sk. docs/PLAN.md).
app.post("/ingest", (c) => c.json({ error: "not_implemented" }, 501));

export default app;
