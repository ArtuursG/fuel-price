import { describe, expect, it } from "vitest";
import { buildSparklinePath } from "./sparkline";

describe("buildSparklinePath", () => {
	it("returns null for fewer than 2 points", () => {
		expect(buildSparklinePath([])).toBeNull();
		expect(buildSparklinePath([1974])).toBeNull();
	});

	it("returns a moveto+lineto path for 2 points", () => {
		const path = buildSparklinePath([1900, 2000]);
		expect(path).toMatch(/^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
	});

	it("plots a rising value as a falling y (SVG y grows downward)", () => {
		const path = buildSparklinePath([1000, 2000], 64, 24, 2);
		const [, p1, p2] = path!.match(/M([\d.,]+) L([\d.,]+)/)!;
		const y1 = Number(p1.split(",")[1]);
		const y2 = Number(p2.split(",")[1]);
		expect(y2).toBeLessThan(y1); // higher price -> higher on screen (smaller y)
	});

	it("draws a flat horizontal line when all values are equal", () => {
		const path = buildSparklinePath([1900, 1900, 1900], 64, 24, 2);
		const ys = [...path!.matchAll(/[\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
		expect(new Set(ys).size).toBe(1);
	});

	it("spans the full requested width for the first and last point", () => {
		const path = buildSparklinePath([1900, 1950, 2000], 64, 24, 2);
		const xs = [...path!.matchAll(/([\d.]+),[\d.]+/g)].map((m) => Number(m[1]));
		expect(xs[0]).toBeCloseTo(2, 1); // padding
		expect(xs[xs.length - 1]).toBeCloseTo(62, 1); // width - padding
	});
});
