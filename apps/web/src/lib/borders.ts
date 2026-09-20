// Pārrobežu (LV/LT/EE) nedēļas vidējo cenu salīdzinājums, no EU Weekly Oil
// Bulletin (sk. collector/src/collector/sources/official/eu_weekly_oil_bulletin.py).
// Ikdienas Lietuvas staciju līmeņa dati (LEA) paliek bloķēti - šī lapa
// apzināti sākas ar ŠO (nedēļas vidējās, visām trim valstīm no VIENA avota,
// tāpēc savstarpēji salīdzināmas), nevis gaida LEA (sk. docs/PLAN.md 7. fāze).

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
const PRODUCT_LABELS: Record<string, string> = { P95: "95", DSL: "D", LPG: "LPG" };

// Tikai jaunākā zināmā nedēļa - vecāku nedēļu vēsture pagaidām nav rādīta
// (var pievienot vēlāk, ja vajag trendu skatu).
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
