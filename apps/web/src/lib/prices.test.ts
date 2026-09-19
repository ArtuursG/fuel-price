import { describe, expect, it } from "vitest";
import { ageBucket, getLatestFuelPrices } from "./prices";

describe("price age in Riga calendar days", () => {
    it.each([
        ["2026-09-19", "2026-09-19T21:30:00Z", "1-2d"],
        ["2026-09-19T21:30:00Z", "2026-09-20T09:00:00Z", "today"],
        ["2026-03-29", "2026-03-29T21:30:00Z", "1-2d"],
        ["2026-10-25", "2026-10-25T22:30:00Z", "1-2d"],
        ["2026-09-18", "2026-09-20T09:00:00Z", "1-2d"],
        ["2026-09-17", "2026-09-20T09:00:00Z", "3-7d"],
        ["2026-09-13", "2026-09-20T09:00:00Z", "3-7d"],
        ["2026-09-12", "2026-09-20T09:00:00Z", "older"],
        ["invalid", "2026-09-20T09:00:00Z", "unknown"],
        ["2026-02-30", "2026-09-20T09:00:00Z", "unknown"],
        ["2026-09-21", "2026-09-20T09:00:00Z", "unknown"],
    ])("%s at %s is %s", (reference, now, expected) => {
        expect(ageBucket(reference, new Date(now))).toBe(expected);
    });
});

it("keeps missing provenance unknown and uses the full observation timestamp", async () => {
    const db = { prepare: () => ({ all: async () => ({ results: [{
        network_id: "test", network_name: "Test", product: "P95", price_milli: 1700,
        prev_price_milli: null, scope: "network", where_text: null, valid_from: null,
        observed_at: "2026-09-19T21:30:00Z", source_type: null, source_url: null,
    }] }) }) } as unknown as D1Database;
    const rows = await getLatestFuelPrices(db, new Date("2026-09-20T09:00:00Z"));
    expect(rows[0].prices[0]).toMatchObject({
        age: "today", origin: null, sourceUrl: null, observedAt: "2026-09-19T21:30:00Z",
        priceMilli: 1700, changeMilli: null,
    });
});
