// Reāli D1 dati (aizstāj sample-data.ts, kas bija placeholder pirms kolektors
// un ingest faktiski strādāja). Forma apzināti sakrīt ar to, ko lietoja
// PriceCard/PriceTable, lai komponentes nemainītos, tikai datu avots.

export type AgeBucket = "today" | "1-2d" | "3-7d" | "older" | "unknown";
export type Origin = "official_site" | "official_register" | "official_aggregate" | "crowd";

export interface NetworkPrice {
	networkId: string;
	networkName: string;
	priceMilli: number;
	changeMilli: number | null; // null = nav iepriekšējās cenas salīdzināšanai (pirmā novērošana)
	age: AgeBucket;
	origin: Origin | null;
	sourceUrl: string | null;
	observedAt: string;
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

// Pilnie nosaukumi virsrakstiem un izvēlnēm; tabulā tie būtu par garu,
// tāpēc PRODUCT_LABELS paliek īsais variants.
export const PRODUCT_FULL_LABELS: Record<string, string> = {
	P95: "Benzīns 95",
	P98: "Benzīns 98",
	DSL: "Dīzeļdegviela",
	DSL_PLUS: "Dīzeļdegviela premium",
	HVO: "HVO dīzelis",
	LPG: "Gāze (LPG)",
	CNG: "Saspiestā gāze (CNG)",
	ADBLUE: "AdBlue",
	E85: "E85",
	DSL_AGRO: "Agro dīzelis",
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
	source_url: string | null;
}

export function formatPrice(priceMilli: number): string {
	return (priceMilli / 1000).toFixed(3).replace(".", ",");
}

const rigaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Riga", year: "numeric", month: "2-digit", day: "2-digit",
});

function calendarDate(value: string | Date): string | null {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const parsed = new Date(`${value}T00:00:00Z`);
        return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = rigaDate.formatToParts(date);
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
}

export function ageBucket(referenceDate: string, now: Date = new Date()): AgeBucket {
    const reference = calendarDate(referenceDate);
    const today = calendarDate(now);
    if (!reference || !today) return "unknown";
    const days = (Date.parse(today) - Date.parse(reference)) / 86_400_000;
    if (days < 0) return "unknown";
    if (days === 0) return "today";
    if (days <= 2) return "1-2d";
    if (days <= 7) return "3-7d";
    return "older";
}

export function formatObservedAt(iso: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T00:00:00Z`).toLocaleDateString("lv-LV", { timeZone: "Europe/Riga" });
    return new Date(iso).toLocaleString("lv-LV", {
        timeZone: "Europe/Riga", dateStyle: "short", timeStyle: "short",
    });
}

export const AGE_LABELS: Record<AgeBucket, string> = {
	today: "šodien",
	"1-2d": "1-2 dienas",
	"3-7d": "3-7 dienas",
	older: "vecāka",
	unknown: "vecums nav zināms",
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
	       r.scope, r.where_text, r.valid_from, r.observed_at, s.source_type, s.url AS source_url
	FROM ranked r
	JOIN networks n ON n.id = r.network_id
	LEFT JOIN scrape_runs sr ON sr.id = r.run_id
	LEFT JOIN sources s ON s.id = sr.source_id
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
			age: ageBucket(row.valid_from ?? row.observed_at, now),
			origin: row.source_type,
			sourceUrl: row.source_url,
			observedAt: row.observed_at,
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

// Cenu vēsture pēdējo 90 dienu laikā, VISIEM (network_id, scope, product)
// vienā pieprasījumā -- ne viens vaicājums par karti, sk. iepriekšējo mācību
// ar EV tarifiem (D1 subrequest/rindu limiti). fuel_prices raksta rindu TIKAI
// pie izmaiņām (ADR-004), tāpēc šī tabula paliek maza ilgi, pat ar plašu logu.
const HISTORY_QUERY = `
	SELECT network_id, scope, product, price_milli, observed_at
	FROM fuel_prices
	WHERE observed_at >= datetime('now', '-90 days')
	ORDER BY observed_at ASC
`;

interface HistoryQueryRow {
	network_id: string;
	scope: string;
	product: string;
	price_milli: number;
	observed_at: string;
}

export type PriceHistory = Map<string, number[]>;

export function historyKey(networkId: string, scope: string, product: string): string {
	return `${networkId}|${scope}|${product}`;
}

export async function getPriceHistory(db: D1Database): Promise<PriceHistory> {
	const { results } = await db.prepare(HISTORY_QUERY).all<HistoryQueryRow>();
	const history: PriceHistory = new Map();
	for (const row of results) {
		const key = historyKey(row.network_id, row.scope, row.product);
		const values = history.get(key) ?? [];
		values.push(row.price_milli);
		history.set(key, values);
	}
	return history;
}

export async function getLastUpdated(db: D1Database): Promise<string | null> {
	const row = await db
		.prepare(
			`SELECT MAX(r.started_at) AS last
			 FROM scrape_runs r
			 JOIN sources s ON s.id = r.source_id
			 WHERE s.kind = 'fuel' AND r.status IN ('ok', 'not_modified')`,
		)
		.first<{ last: string | null }>();
	return row?.last ?? null;
}
