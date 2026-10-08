// Cross-border (LV/LT/EE) comparison of weekly average prices, from the EU
// Weekly Oil Bulletin (see collector/src/collector/sources/official/eu_weekly_oil_bulletin.py).
// Daily station-level data for Lithuania (LEA) is still blocked - this page
// deliberately starts with THIS (weekly averages for all three countries from
// ONE source, so they are comparable with each other) instead of waiting for
// LEA (see docs/PLAN.md phase 7).

export type BorderCountry = "LV" | "LT" | "EE";

export const COUNTRY_LABELS: Record<BorderCountry, string> = {
	LV: "Latvija",
	LT: "Lietuva",
	EE: "Igaunija",
};

export interface BorderProductRow {
	product: string;
	label: string;
	prices: Partial<Record<BorderCountry, number>>;
}

export interface BorderComparison {
	weekMonday: string | null;
	rows: BorderProductRow[];
}

interface BorderQueryRow {
	week_monday: string;
	merchant: string;
	product: string;
	avg_price_milli: number;
}

const PRODUCT_ORDER = ["P95", "DSL", "LPG"];
const PRODUCT_LABELS: Record<string, string> = { P95: "Benzīns 95", DSL: "Dīzeļdegviela", LPG: "Gāze (LPG)" };

// Only the latest known week - history of older weeks is not shown yet
// (can be added later if a trend view is needed).
const QUERY = `
	SELECT week_monday, merchant, product, avg_price_milli
	FROM official_weekly
	WHERE week_monday = (SELECT MAX(week_monday) FROM official_weekly)
`;

export async function getBorderComparison(db: D1Database): Promise<BorderComparison> {
	const { results } = await db.prepare(QUERY).all<BorderQueryRow>();
	if (results.length === 0) {
		return { weekMonday: null, rows: [] };
	}

	const byProduct = new Map<string, Partial<Record<BorderCountry, number>>>();
	for (const row of results) {
		const entry = byProduct.get(row.product) ?? {};
		entry[row.merchant as BorderCountry] = row.avg_price_milli;
		byProduct.set(row.product, entry);
	}

	return {
		weekMonday: results[0].week_monday,
		rows: PRODUCT_ORDER.filter((p) => byProduct.has(p)).map((product) => ({
			product,
			label: PRODUCT_LABELS[product] ?? product,
			prices: byProduct.get(product) ?? {},
		})),
	};
}
