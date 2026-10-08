import { describe, expect, it } from "vitest";
import { ageBucket, formatDayMonth, formatMoney, formatPrice, getLatestFuelPrices, priceFreshness } from "./prices";

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
        age: "today", origin: null, sourceUrl: null, observedAt: "2026-09-19T21:30:00Z", checkedAt: "2026-09-19T21:30:00Z",
        priceMilli: 1700, changeMilli: null,
    });
});

describe("priceFreshness", () => {
    const now = new Date("2026-10-08T09:00:00Z");
    // Circle K HVO: 2,490 since 18 September, still listed on a page dated 6 October.
    const unchanged = { observed_at: "2026-09-18T07:00:00Z", valid_from: "2026-09-18" };

    it("keeps the old rule for a row no run has confirmed yet", () => {
        expect(priceFreshness({ ...unchanged, confirmed_at: null, confirmed_valid_from: null }, now)).toEqual({
            age: "older", checkedAt: "2026-09-18T07:00:00Z",
        });
    });
    it("follows the date the source gave when the price was last seen", () => {
        expect(priceFreshness({ ...unchanged, confirmed_at: "2026-10-08T07:57:00Z", confirmed_valid_from: "2026-10-06" }, now)).toEqual({
            age: "1-2d", checkedAt: "2026-10-08T07:57:00Z",
        });
    });
    it("uses the check itself when the source gives no date", () => {
        expect(priceFreshness({ observed_at: "2026-09-18T07:00:00Z", valid_from: null, confirmed_at: "2026-10-08T07:57:00Z", confirmed_valid_from: null }, now).age).toBe("today");
    });
    it("goes stale again when runs stop seeing the price", () => {
        expect(priceFreshness({ ...unchanged, confirmed_at: "2026-09-25T07:57:00Z", confirmed_valid_from: null }, now).age).toBe("older");
    });
});

it("formats a short day and month in Riga time", () => {
    expect(formatDayMonth("2026-09-17T22:30:00Z")).toBe("18.09.");
});

describe("number formatting", () => {
    it("keeps three decimals for a unit price", () => {
        expect(formatPrice(1874)).toBe("1,874");
    });
    it("rounds money to cents and groups thousands", () => {
        expect(formatMoney(13118)).toBe("13,12");
        expect(formatMoney(110191)).toBe("110,19");
        // lv-LV groups with a non-breaking space, starting from five-digit numbers.
        expect(formatMoney(1234567)).toBe("1234,57");
        expect(formatMoney(12345678).replace(/\s/g, " ")).toBe("12 345,68");
    });
});
