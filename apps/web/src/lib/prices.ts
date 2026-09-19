// Reāli D1 dati (aizstāj sample-data.ts, kas bija placeholder pirms kolektors
// un ingest faktiski strādāja). Forma apzināti sakrīt ar to, ko lietoja
// PriceCard/PriceTable, lai komponentes nemainītos, tikai datu avots.

export type AgeBucket = "today" | "1-2d" | "3-7d" | "older";
export type Origin = "official_site" | "official_register" | "official_aggregate" | "crowd";

export interface NetworkPrice {
	networkId: string;
	networkName: string;
	priceMilli: number;
	changeMilli: number | null; // null = nav iepriekšējās cenas salīdzināšanai (pirmā novērošana)
	age: AgeBucket;
	origin: Origin;
	scope: string;
	whereText: string | null;
}

export interface ProductRow {
	product: string;
	label: string;
	prices: NetworkPrice[];
}

const PRODUCT_ORDER = ["P95", "P98", "DSL", "DSL_PLUS", "HVO", "LPG", "CNG", "ADBLUE", "E85", "DSL_AGRO"];
export const PRODUCT_LABELS: Record<string, string> = {
	P95: "95",
	P98: "98",
	DSL: "D",
	DSL_PLUS: "D+",
	HVO: "HVO",
	LPG: "LPG",
	CNG: "CNG",
	ADBLUE: "AdBlue",
	E85: "E85",
	DSL_AGRO: "Agro D", // TODO(4. fāze, Virši): NEKAD nerādīt bez skaidras "nav vieglajām automašīnām" atrunas.
};

interface FuelPriceQueryRow {
	network_id: string;
	network_name: string;
	product: string;
	price_milli: number;
	prev_price_milli: number | null;
	scope: string;
	where_text: string | null;
	valid_from: string | null;
	observed_at: string;
	source_type: Origin | null;
}

export function formatPrice(priceMilli: number): string {
	return (priceMilli / 1000).toFixed(3).replace(".", ",");
}

function ageBucket(referenceDate: string, now: Date = new Date()): AgeBucket {
	const ref = new Date(`${referenceDate}T00:00:00Z`);
	const days = Math.floor((now.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
	if (days <= 0) return "today";
	if (days <= 2) return "1-2d";
	if (days <= 7) return "3-7d";
	return "older";
}

export const AGE_LABELS: Record<AgeBucket, string> = {
	today: "šodien",
	"1-2d": "1-2 dienas",
	"3-7d": "3-7 dienas",
	older: "vecāka",
};

export const ORIGIN_LABELS: Record<Origin, string> = {
	official_site: "tīkla lapa",
	official_register: "oficiāls reģistrs",
	official_aggregate: "oficiālais vidējais",
	crowd: "kopienas dati",
};

// Katrai (network_id, scope, product) grupai -- jaunākā rinda UN tai
// tieši iepriekšējā (LAG), lai varētu rādīt izmaiņu, tiklīdz ir >1 novērojums.
const QUERY = `
	WITH ranked AS (
		SELECT
			fp.*,
			ROW_NUMBER() OVER (PARTITION BY fp.network_id, fp.scope, fp.product ORDER BY fp.observed_at DESC) AS rn,
			LAG(fp.price_milli) OVER (PARTITION BY fp.network_id, fp.scope, fp.product ORDER BY fp.observed_at) AS prev_price_milli
		FROM fuel_prices fp
	)
	SELECT r.network_id, n.name AS network_name, r.product, r.price_milli, r.prev_price_milli,
	       r.scope, r.where_text, r.valid_from, r.observed_at, s.source_type
	FROM ranked r
	JOIN networks n ON n.id = r.network_id
	LEFT JOIN sources s ON s.network_id = r.network_id AND s.kind = 'fuel'
	WHERE r.rn = 1
	ORDER BY r.product, r.price_milli
`;

export async function getLatestFuelPrices(db: D1Database, now: Date = new Date()): Promise<ProductRow[]> {
	const { results } = await db.prepare(QUERY).all<FuelPriceQueryRow>();

	const byProduct = new Map<string, NetworkPrice[]>();
	for (const row of results) {
		const list = byProduct.get(row.product) ?? [];
		list.push({
			networkId: row.network_id,
			networkName: row.network_name,
			priceMilli: row.price_milli,
			changeMilli: row.prev_price_milli === null ? null : row.price_milli - row.prev_price_milli,
			age: ageBucket(row.valid_from ?? row.observed_at.slice(0, 10), now),
			origin: row.source_type ?? "official_site",
			scope: row.scope,
			whereText: row.where_text,
		});
		byProduct.set(row.product, list);
	}

	return PRODUCT_ORDER.filter((p) => byProduct.has(p)).map((product) => ({
		product,
		label: PRODUCT_LABELS[product] ?? product,
		prices: (byProduct.get(product) ?? []).sort((a, b) => a.priceMilli - b.priceMilli),
	}));
}

export function cheapest(row: ProductRow): NetworkPrice {
	return row.prices[0];
}
