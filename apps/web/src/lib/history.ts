// Cenu vēsture 30 dienām.
//
// ADR-004: rinda fuel_prices tabulā top TIKAI tad, kad cena mainās. Tas
// nozīmē, ka dienā bez izmaiņām datu nav vispār - bet cena tajā dienā
// bija spēkā, vienkārši tā pati, kas iepriekš. Tāpēc dienas rinda te tiek
// aizpildīta uz priekšu no pēdējā novērojuma; bez tā grafiks rādītu
// pārrāvumus tur, kur patiesībā cena bija stabila.
//
// Pirms pirmā novērojuma vērtības nav - tur paliek null, nevis izdomāts
// skaitlis.

export interface HistoryRow {
	networkId: string;
	networkName: string;
	localDate: string;
	priceMilli: number;
}

export interface NetworkSeries {
	networkId: string;
	networkName: string;
	points: (number | null)[];
	lastMilli: number | null;
	firstMilli: number | null;
}

export function dayKeys(days: number, today: Date): string[] {
	const keys: string[] = [];
	for (let i = days - 1; i >= 0; i -= 1) {
		const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
		keys.push(d.toISOString().slice(0, 10));
	}
	return keys;
}

export function buildDailySeries(rows: HistoryRow[], days: string[]): NetworkSeries[] {
	const byNetwork = new Map<string, HistoryRow[]>();
	for (const row of rows) {
		const list = byNetwork.get(row.networkId) ?? [];
		list.push(row);
		byNetwork.set(row.networkId, list);
	}

	const series: NetworkSeries[] = [];
	for (const [networkId, list] of byNetwork) {
		const sorted = [...list].sort((a, b) => a.localDate.localeCompare(b.localDate));
		const points: (number | null)[] = [];
		let cursor = 0;
		let current: number | null = null;
		for (const day of days) {
			// Vairākas izmaiņas vienā dienā - ņemam pēdējo.
			while (cursor < sorted.length && sorted[cursor].localDate <= day) {
				current = sorted[cursor].priceMilli;
				cursor += 1;
			}
			points.push(current);
		}
		const known = points.filter((p): p is number => p !== null);
		series.push({
			networkId,
			networkName: sorted[0].networkName,
			points,
			firstMilli: known.length > 0 ? known[0] : null,
			lastMilli: known.length > 0 ? known[known.length - 1] : null,
		});
	}

	// Lētākais šodien - augšā.
	series.sort((a, b) => (a.lastMilli ?? Infinity) - (b.lastMilli ?? Infinity));
	return series;
}

export interface ChartGeometry {
	min: number;
	max: number;
	paths: { networkId: string; networkName: string; d: string }[];
}

// Visām līnijām viena mēroga ass - citādi tīklus nevar salīdzināt.
export function buildChartPaths(series: NetworkSeries[], width: number, height: number): ChartGeometry | null {
	const all = series.flatMap((s) => s.points).filter((p): p is number => p !== null);
	if (all.length === 0) return null;

	let min = Math.min(...all);
	let max = Math.max(...all);
	if (min === max) {
		// Viena vienīga cena - citādi dalītu ar nulli un līnija pazustu.
		min -= 10;
		max += 10;
	}
	const span = max - min;
	const dayCount = series[0]?.points.length ?? 0;
	const stepX = dayCount > 1 ? width / (dayCount - 1) : 0;

	const paths = series.map((s) => {
		let d = "";
		let pen = "M";
		s.points.forEach((value, i) => {
			if (value === null) {
				pen = "M";
				return;
			}
			const x = (i * stepX).toFixed(2);
			const y = (height - ((value - min) / span) * height).toFixed(2);
			d += `${pen}${x} ${y} `;
			pen = "L";
		});
		return { networkId: s.networkId, networkName: s.networkName, d: d.trim() };
	});

	return { min, max, paths };
}

interface HistoryQueryRow {
	network_id: string;
	network_name: string;
	local_date: string;
	price_milli: number;
}

// Ņemam arī rindas pirms loga sākuma: pēdējā cena pirms 30 dienām ir tā,
// kas bija spēkā loga pirmajā dienā.
const PRODUCT_HISTORY_QUERY = `
	SELECT f.network_id, n.name AS network_name, f.local_date, f.price_milli
	FROM fuel_prices f
	JOIN networks n ON n.id = f.network_id
	WHERE f.product = ?1 AND f.scope != 'station'
	ORDER BY f.local_date ASC, f.observed_at ASC
	LIMIT 5000
`;

export async function getProductHistory(db: D1Database, product: string): Promise<HistoryRow[]> {
	const { results } = await db.prepare(PRODUCT_HISTORY_QUERY).bind(product).all<HistoryQueryRow>();
	return results.map((r) => ({
		networkId: r.network_id,
		networkName: r.network_name,
		localDate: r.local_date,
		priceMilli: r.price_milli,
	}));
}

export function distinctDays(rows: HistoryRow[]): number {
	return new Set(rows.map((r) => r.localDate)).size;
}
