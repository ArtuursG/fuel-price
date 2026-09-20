import { describe, expect, it } from "vitest";
import {
	buildSparklineArea,
	buildSparklineBars,
	sparklineDirection,
	SPARKLINE_HEIGHT,
	SPARKLINE_WIDTH,
} from "./sparkline";

describe("sparklineDirection", () => {
	it("salīdzina pēdējo ar pirmo, ne ar iepriekšējo", () => {
		// Cena pa vidu pakāpās, bet kopumā ir zemāka nekā sākumā.
		expect(sparklineDirection([1950, 1990, 1900])).toBe("down");
	});
	it("bez otrā novērojuma virziena nav", () => {
		expect(sparklineDirection([1950])).toBe("flat");
		expect(sparklineDirection([])).toBe("flat");
	});
	it("vienāda cena ir flat", () => {
		expect(sparklineDirection([1950, 1950])).toBe("flat");
	});
});

describe("buildSparklineArea", () => {
	it("atgriež null bez datiem", () => {
		expect(buildSparklineArea([])).toBeNull();
	});

	it("ar vienu novērojumu dod punktu, nevis izdomātu līniju", () => {
		const spark = buildSparklineArea([1950]);
		expect(spark).not.toBeNull();
		expect(spark!.line).toBeNull();
		expect(spark!.area).toBeNull();
		expect(spark!.last).toEqual({ x: SPARKLINE_WIDTH / 2, y: SPARKLINE_HEIGHT / 2 });
	});

	it("aizver pildījumu līdz apakšai", () => {
		const spark = buildSparklineArea([1900, 1950]);
		expect(spark!.area).toContain(`L${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`);
		expect(spark!.area).toContain(`L0 ${SPARKLINE_HEIGHT}`);
		expect(spark!.area?.endsWith("Z")).toBe(true);
	});

	it("liek pēdējo punktu līnijas galā", () => {
		const spark = buildSparklineArea([1900, 2000]);
		expect(spark!.last.x).toBeCloseTo(SPARKLINE_WIDTH, 5);
		// Augstākā cena -- augšā, tātad maza y vērtība.
		expect(spark!.last.y).toBeLessThan(SPARKLINE_HEIGHT / 2);
	});

	it("nedalās ar nulli, kad visas cenas vienādas", () => {
		const spark = buildSparklineArea([1950, 1950, 1950]);
		expect(spark!.line).not.toContain("NaN");
		expect(spark!.area).not.toContain("NaN");
	});

	it("tur līniju rāmja iekšpusē", () => {
		const spark = buildSparklineArea([1874, 2490, 1900, 2100]);
		const ys = [...spark!.line!.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
		for (const y of ys) {
			expect(y).toBeGreaterThanOrEqual(0);
			expect(y).toBeLessThanOrEqual(SPARKLINE_HEIGHT);
		}
	});
});

describe("buildSparklineBars", () => {
	it("dod pa stabiņam katram novērojumam", () => {
		expect(buildSparklineBars([1900, 1950, 1920])).toHaveLength(3);
		expect(buildSparklineBars([])).toEqual([]);
	});

	it("krāso pēc iepriekšējās dienas, ne pēc sākuma", () => {
		// Pēdējā vērtība ir augstāka par pirmo, bet zemāka par iepriekšējo.
		const bars = buildSparklineBars([1900, 2000, 1950]);
		expect(bars.map((b) => b.direction)).toEqual(["flat", "up", "down"]);
	});

	it("tur stabiņus rāmja iekšpusē", () => {
		const bars = buildSparklineBars([1874, 2490, 1900]);
		for (const bar of bars) {
			expect(bar.x).toBeGreaterThanOrEqual(0);
			expect(bar.x + bar.width).toBeLessThanOrEqual(SPARKLINE_WIDTH + 0.01);
			expect(bar.height).toBeGreaterThanOrEqual(0);
		}
	});

	it("sašaurina atstarpi, kad novērojumu ir daudz", () => {
		const few = buildSparklineBars([1, 2, 3]);
		const many = buildSparklineBars(Array.from({ length: 30 }, (_, i) => 1900 + i));
		expect(many[0].width).toBeLessThan(few[0].width);
		expect(many[0].width).toBeGreaterThan(0);
	});
});
