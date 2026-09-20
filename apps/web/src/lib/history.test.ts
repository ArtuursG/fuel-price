import { describe, expect, it } from "vitest";
import { buildChartPaths, buildDailySeries, dayKeys, distinctDays } from "./history";

const DAYS = ["2026-09-18", "2026-09-19", "2026-09-20"];

describe("dayKeys", () => {
	it("dod augošu dienu rindu, kas beidzas šodien", () => {
		expect(dayKeys(3, new Date("2026-09-20T08:00:00Z"))).toEqual(DAYS);
	});
});

describe("buildDailySeries", () => {
	it("aizpilda uz priekšu dienas bez izmaiņām", () => {
		// ADR-004: rinda top tikai pie izmaiņas, tāpēc 19. un 20. datu nav,
		// bet cena tajās dienās bija spēkā.
		const series = buildDailySeries(
			[{ networkId: "kool", networkName: "KOOL", localDate: "2026-09-18", priceMilli: 1947 }],
			DAYS,
		);
		expect(series[0].points).toEqual([1947, 1947, 1947]);
		expect(series[0].lastMilli).toBe(1947);
	});

	it("atstāj null pirms pirmā novērojuma", () => {
		const series = buildDailySeries(
			[{ networkId: "kool", networkName: "KOOL", localDate: "2026-09-20", priceMilli: 1947 }],
			DAYS,
		);
		expect(series[0].points).toEqual([null, null, 1947]);
	});

	it("ņem dienas pēdējo vērtību, ja izmaiņas bijušas vairākas", () => {
		const series = buildDailySeries(
			[
				{ networkId: "viada", networkName: "Viada", localDate: "2026-09-19", priceMilli: 1950 },
				{ networkId: "viada", networkName: "Viada", localDate: "2026-09-19", priceMilli: 1930 },
			],
			DAYS,
		);
		expect(series[0].points).toEqual([null, 1930, 1930]);
	});

	it("liek lētāko tīklu pirmo", () => {
		const series = buildDailySeries(
			[
				{ networkId: "a", networkName: "A", localDate: "2026-09-18", priceMilli: 2100 },
				{ networkId: "b", networkName: "B", localDate: "2026-09-18", priceMilli: 1900 },
			],
			DAYS,
		);
		expect(series.map((s) => s.networkId)).toEqual(["b", "a"]);
	});
});

describe("buildChartPaths", () => {
	it("atgriež null, ja datu nav", () => {
		expect(buildChartPaths([{ networkId: "a", networkName: "A", points: [null, null], firstMilli: null, lastMilli: null }], 100, 50)).toBeNull();
	});

	it("nedalās ar nulli, ja visas cenas vienādas", () => {
		const geometry = buildChartPaths(
			[{ networkId: "a", networkName: "A", points: [2000, 2000], firstMilli: 2000, lastMilli: 2000 }],
			100,
			50,
		);
		expect(geometry).not.toBeNull();
		expect(geometry!.paths[0].d).not.toContain("NaN");
	});

	it("pārtrauc līniju tur, kur datu nav", () => {
		const geometry = buildChartPaths(
			[{ networkId: "a", networkName: "A", points: [1900, null, 2000], firstMilli: 1900, lastMilli: 2000 }],
			100,
			50,
		);
		// Divi atsevišķi "M" -- līnija netiek novilkta pāri tukšumam.
		expect(geometry!.paths[0].d.match(/M/g)).toHaveLength(2);
	});
});

describe("distinctDays", () => {
	it("skaita unikālās dienas", () => {
		expect(
			distinctDays([
				{ networkId: "a", networkName: "A", localDate: "2026-09-19", priceMilli: 1 },
				{ networkId: "b", networkName: "B", localDate: "2026-09-19", priceMilli: 2 },
				{ networkId: "b", networkName: "B", localDate: "2026-09-20", priceMilli: 3 },
			]),
		).toBe(2);
	});
});
