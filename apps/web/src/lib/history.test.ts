import { describe, expect, it } from "vitest";
import { buildChartPaths, buildDailySeries, chartDomain, darkVariant, dayKeys, distinctDays, seriesColors, weekTicks } from "./history";

const DAYS = ["2026-09-18", "2026-09-19", "2026-09-20"];

describe("dayKeys", () => {
	it("dod augošu dienu rindu, kas beidzas šodien", () => {
		expect(dayKeys(3, new Date("2026-09-20T08:00:00Z"))).toEqual(DAYS);
	});
});

describe("buildDailySeries", () => {
	it("aizpilda uz priekšu dienas bez izmaiņām", () => {
		// ADR-004: a row is only written on a change, so the 19th and 20th have no
		// data, but the price was in force on those days.
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
		// Two separate "M"s - the line is not drawn across the gap.
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

const one = (points: (number | null)[]) => [{ networkId: "a", networkName: "A", points, firstMilli: null, lastMilli: null }];

describe("chartDomain", () => {
	it("noapaļo asi līdz apaļiem centiem un dod vairākas palīglīnijas", () => {
		expect(chartDomain(one([1874, 1997]))).toEqual({ min: 1850, max: 2000, ticks: [1850, 1900, 1950, 2000] });
	});

	it("nedod vairāk palīglīniju, kā prasīts", () => {
		const domain = chartDomain(one([1700, 2500]), 5)!;
		expect(domain.ticks.length).toBeLessThanOrEqual(6);
		expect(domain.min).toBeLessThanOrEqual(1700);
		expect(domain.max).toBeGreaterThanOrEqual(2500);
	});

	it("dod asi arī vienai vienīgai cenai", () => {
		const domain = chartDomain(one([2000, 2000]))!;
		expect(domain.min).toBeLessThan(2000);
		expect(domain.max).toBeGreaterThan(2000);
	});

	it("atgriež null, ja datu nav", () => {
		expect(chartDomain(one([null]))).toBeNull();
	});
});

describe("weekTicks", () => {
	it("atzīmē katru septīto dienu, beidzot ar šodienu", () => {
		const days = dayKeys(15, new Date("2026-10-07T08:00:00Z"));
		expect(weekTicks(days).map((t) => t.day)).toEqual(["2026-09-23", "2026-09-30", "2026-10-07"]);
	});
});

describe("seriesColors", () => {
	it("tīklam ir viena un tā pati krāsa neatkarīgi no pārējiem", () => {
		const a = seriesColors(["circlek", "virsi"]);
		const b = seriesColors(["viada", "circlek", "kool", "virsi"]);
		expect(a.get("circlek")).toBe(b.get("circlek"));
		expect(a.get("virsi")).toBe(b.get("virsi"));
	});

	it("nezināmam tīklam dod brīvu krāsu, nevis jau aizņemtu", () => {
		const colors = seriesColors(["circlek", "jauns"]);
		expect(colors.get("jauns")).not.toBe(colors.get("circlek"));
	});
});

describe("buildChartPaths ar doto asi", () => {
	it("novieto vērtības pēc dotās ass, nevis pēc datu min/max", () => {
		const geometry = buildChartPaths(one([1900, 1950]), 100, 100, { min: 1900, max: 2000 })!;
		expect(geometry.paths[0].d).toBe("M0.00 100.00 L100.00 50.00");
	});
});

describe("darkVariant", () => {
	it("lightens a line colour that is too dark for the dark background", () => {
		expect(darkVariant("#4a3aa7")).toBe("#8c7ae6");
	});
	it("keeps colours that already read on both backgrounds", () => {
		expect(darkVariant("#2a78d6")).toBe("#2a78d6");
	});
});
