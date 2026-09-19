import { describe, expect, it } from "vitest";
import {
	EvTariffSchema,
	FuelPriceSchema,
	IngestBatchSchema,
	OfficialWeeklyPriceSchema,
	StationSchema,
	computeSignature,
	computeTariffHash,
	decidePriceUpdate,
	decideTariffUpdate,
	isTimestampFresh,
	localDate,
	verifySignature,
} from "./ingest-logic";

describe("computeSignature / verifySignature", () => {
	it("verifies a signature computed with the same secret", async () => {
		const signature = await computeSignature("s3cret", "2026-09-18T12:00:00Z", '{"a":1}');
		expect(await verifySignature("s3cret", "2026-09-18T12:00:00Z", '{"a":1}', signature)).toBe(true);
	});

	it("rejects a signature computed with a different secret", async () => {
		const signature = await computeSignature("s3cret", "2026-09-18T12:00:00Z", '{"a":1}');
		expect(await verifySignature("wrong", "2026-09-18T12:00:00Z", '{"a":1}', signature)).toBe(false);
	});

	it("rejects when the body was tampered with after signing", async () => {
		const signature = await computeSignature("s3cret", "2026-09-18T12:00:00Z", '{"a":1}');
		expect(await verifySignature("s3cret", "2026-09-18T12:00:00Z", '{"a":2}', signature)).toBe(false);
	});

	it("produces the documented sha256= prefix", async () => {
		const signature = await computeSignature("s3cret", "2026-09-18T12:00:00Z", "{}");
		expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
	});
});

describe("isTimestampFresh", () => {
	const now = new Date("2026-09-18T12:00:00Z");

	it("accepts a timestamp within 5 minutes", () => {
		expect(isTimestampFresh("2026-09-18T11:57:00Z", now)).toBe(true);
	});

	it("rejects a timestamp more than 5 minutes old", () => {
		expect(isTimestampFresh("2026-09-18T11:00:00Z", now)).toBe(false);
	});

	it("rejects a timestamp in the future beyond the skew", () => {
		expect(isTimestampFresh("2026-09-18T12:10:00Z", now)).toBe(false);
	});

	it("rejects an unparseable timestamp", () => {
		expect(isTimestampFresh("not-a-date", now)).toBe(false);
	});
});

describe("decidePriceUpdate", () => {
	it("inserts with no flag when there is no previous price", () => {
		expect(decidePriceUpdate(null, 1900)).toEqual({ action: "insert", flags: null });
	});

	it("no-ops when the price is unchanged", () => {
		expect(decidePriceUpdate(1900, 1900)).toEqual({ action: "no_change" });
	});

	it("inserts without a jump flag for a small change", () => {
		expect(decidePriceUpdate(1900, 1950)).toEqual({ action: "insert", flags: null }); // ~2.6%
	});

	it("flags a jump for a change of 8% or more", () => {
		expect(decidePriceUpdate(1900, 2100)).toEqual({ action: "insert", flags: "jump" }); // ~10.5%
	});
});

describe("localDate", () => {
	it("matches the collector's Europe/Riga conversion for a UTC evening timestamp", () => {
		// Same case as collector/tests/test_time.py -- keep both in sync.
		expect(localDate(new Date("2026-09-17T22:00:00Z"))).toBe("2026-09-18");
	});
});

describe("IngestBatchSchema", () => {
	it("accepts a minimal valid batch", () => {
		const result = IngestBatchSchema.safeParse({
			run: { source_id: "circlek-fuel-web", started_at: "2026-09-18T12:00:00Z", status: "ok" },
			fuel: [{ network_id: "circlek", scope: "cheapest_riga", product: "P95", price_milli: 1914 }],
		});
		expect(result.success).toBe(true);
	});

	it("rejects a non-positive price", () => {
		const result = FuelPriceSchema.safeParse({
			network_id: "circlek",
			scope: "cheapest_riga",
			product: "P95",
			price_milli: 0,
		});
		expect(result.success).toBe(false);
	});

	it("rejects an unknown scope value", () => {
		const result = FuelPriceSchema.safeParse({
			network_id: "circlek",
			scope: "everywhere",
			product: "P95",
			price_milli: 1914,
		});
		expect(result.success).toBe(false);
	});

	it("defaults fuel/ev/official_weekly to empty arrays when omitted", () => {
		const result = IngestBatchSchema.safeParse({
			run: { source_id: "circlek-fuel-web", started_at: "2026-09-18T12:00:00Z", status: "not_modified" },
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.fuel).toEqual([]);
			expect(result.data.ev).toEqual([]);
			expect(result.data.official_weekly).toEqual([]);
		}
	});

	it("accepts a batch with official_weekly entries", () => {
		const result = IngestBatchSchema.safeParse({
			run: { source_id: "eu-weekly-oil-bulletin", started_at: "2026-09-18T12:00:00Z", status: "ok" },
			official_weekly: [
				{
					week_monday: "2026-09-14",
					merchant: "LV",
					product: "P95",
					avg_price_milli: 1976,
					source_url: "https://energy.ec.europa.eu/document/download/x",
				},
			],
		});
		expect(result.success).toBe(true);
	});
});

describe("computeTariffHash / decideTariffUpdate", () => {
	const baseTariff = {
		network_id: "emobi",
		station_id: "emobi:x",
		current_type: "DC" as const,
		payment: "app" as const,
		power_min_kw: 50,
		power_max_kw: 50,
		connector: "CCS2",
		energy_milli_per_kwh: null,
		time_milli_per_min: 190,
		session_fee_milli: null,
		min_fee_milli: null,
		idle_fee_milli_per_min: null,
		idle_after_min: null,
		time_from: null,
		time_to: null,
		weekdays: null,
		vat_included: true,
	};

	it("produces the same hash for identical price-defining fields", async () => {
		const a = await computeTariffHash(baseTariff);
		const b = await computeTariffHash({ ...baseTariff });
		expect(a).toBe(b);
	});

	it("changes the hash when the price changes", async () => {
		const a = await computeTariffHash(baseTariff);
		const b = await computeTariffHash({ ...baseTariff, time_milli_per_min: 200 });
		expect(a).not.toBe(b);
	});

	it("ignores slot-identity fields (network_id/station_id/current_type/connector/payment)", async () => {
		// those are the WHERE-clause key in index.ts, not part of the hash --
		// changing them here must not change the hash.
		const a = await computeTariffHash(baseTariff);
		const b = await computeTariffHash({ ...baseTariff, network_id: "elektrum", station_id: "other" });
		expect(a).toBe(b);
	});

	it("decideTariffUpdate no-ops when the hash is unchanged", async () => {
		const hash = await computeTariffHash(baseTariff);
		expect(decideTariffUpdate(hash, hash)).toEqual({ action: "no_change" });
	});

	it("decideTariffUpdate inserts when there is no previous hash", async () => {
		const hash = await computeTariffHash(baseTariff);
		expect(decideTariffUpdate(null, hash)).toEqual({ action: "insert" });
	});

	it("decideTariffUpdate inserts when the hash changed", async () => {
		const a = await computeTariffHash(baseTariff);
		const b = await computeTariffHash({ ...baseTariff, time_milli_per_min: 200 });
		expect(decideTariffUpdate(a, b)).toEqual({ action: "insert" });
	});
});

describe("StationSchema / EvTariffSchema", () => {
	it("accepts a minimal station", () => {
		const result = StationSchema.safeParse({ id: "emobi:x", network_id: "emobi" });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.country).toBe("LV"); // default
		}
	});

	it("rejects an unknown current_type", () => {
		const result = EvTariffSchema.safeParse({
			network_id: "emobi",
			current_type: "GAS",
			payment: "app",
		});
		expect(result.success).toBe(false);
	});

	it("IngestBatchSchema defaults stations to an empty array when omitted", () => {
		const result = IngestBatchSchema.safeParse({
			run: { source_id: "emobi-ev", started_at: "2026-09-19T12:00:00Z", status: "ok" },
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.stations).toEqual([]);
		}
	});
});

describe("OfficialWeeklyPriceSchema", () => {
	it("rejects a non-positive price", () => {
		const result = OfficialWeeklyPriceSchema.safeParse({
			week_monday: "2026-09-14",
			merchant: "LV",
			product: "P95",
			avg_price_milli: 0,
			source_url: "https://energy.ec.europa.eu/document/download/x",
		});
		expect(result.success).toBe(false);
	});
});
