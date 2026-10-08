// 30-day price history.
//
// ADR-004: a row is written to fuel_prices ONLY when the price changes. That
// means a day without a change has no data at all - but a price was in force
// that day, simply the same one as before. So the daily series is filled
// forward from the last observation here; without that the chart would show
// gaps where the price was in fact stable.
//
// Before the first observation there is no value - it stays null rather than
// an invented number.

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
			// Several changes on one day - take the last one.
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

	// Cheapest today first.
	series.sort((a, b) => (a.lastMilli ?? Infinity) - (b.lastMilli ?? Infinity));
	return series;
}

export interface ChartDomain {
	min: number;
	max: number;
	/** Values of the horizontal gridlines (milli), bottom to top. */
	ticks: number[];
}

// Steps that read as round cents: 0,005 €, 0,01 €, 0,02 € ...
const TICK_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/**
 * Axis bounds rounded to a round step, with 3-6 gridlines. The chart used to
 * show only the min and max, and the values in between had to be guessed.
 */
export function chartDomain(series: NetworkSeries[], maxTicks = 5): ChartDomain | null {
	const all = series.flatMap((s) => s.points).filter((p): p is number => p !== null);
	if (all.length === 0) return null;
	let low = Math.min(...all);
	let high = Math.max(...all);
	if (low === high) {
		// A single price - otherwise the axis would have zero height.
		low -= 10;
		high += 10;
	}
	const step = TICK_STEPS.find((s) => Math.ceil(high / s) - Math.floor(low / s) <= maxTicks) ?? TICK_STEPS[TICK_STEPS.length - 1];
	const min = Math.floor(low / step) * step;
	const max = Math.ceil(high / step) * step;
	const ticks: number[] = [];
	for (let v = min; v <= max; v += step) ticks.push(v);
	return { min, max, ticks };
}

/** X axis ticks every week, counting back from today. */
export function weekTicks(days: string[]): { index: number; day: string }[] {
	const ticks: { index: number; day: string }[] = [];
	for (let i = days.length - 1; i >= 0; i -= 7) ticks.unshift({ index: i, day: days[i] });
	return ticks;
}

// The colour follows the network, not its position in the list: colours used
// to be assigned in price order, so a network changed colour when switching
// fuel. The order has been checked in a colour-blindness simulation; red and
// green are deliberately left out, since on this site they mean "price rose"
// and "price fell".
const SERIES_COLORS: Record<string, string> = {
	straujupite: "#2a78d6",
	circlek: "#eb6834",
	virsi: "#1baf7a",
	kool: "#eda100",
	viada: "#e87ba4",
	neste: "#4a3aa7",
};
const SPARE_COLORS = ["#4a3aa7", "#eda100", "#e87ba4"];
export const OTHER_SERIES_COLOR = "#8a949c";

// On the dark background a few of these are too dark to see (under 3:1);
// they get a lighter tone of the same hue there, so a network keeps its colour.
const DARK_VARIANTS: Record<string, string> = {
	"#4a3aa7": "#8c7ae6",
};

export function darkVariant(color: string): string {
	return DARK_VARIANTS[color] ?? color;
}

/** A colour per network in the chart; unknown ones get a spare colour or grey. */
export function seriesColors(networkIds: string[]): Map<string, string> {
	const used = new Set(networkIds.map((id) => SERIES_COLORS[id]).filter(Boolean));
	const spare = SPARE_COLORS.filter((c) => !used.has(c));
	const colors = new Map<string, string>();
	for (const id of [...networkIds].sort()) {
		colors.set(id, SERIES_COLORS[id] ?? spare.shift() ?? OTHER_SERIES_COLOR);
	}
	return colors;
}

export interface ChartGeometry {
	min: number;
	max: number;
	paths: { networkId: string; networkName: string; d: string }[];
}

// One axis scale for all lines - otherwise the networks cannot be compared.
export function buildChartPaths(
	series: NetworkSeries[],
	width: number,
	height: number,
	domain?: { min: number; max: number },
): ChartGeometry | null {
	const all = series.flatMap((s) => s.points).filter((p): p is number => p !== null);
	if (all.length === 0) return null;

	let min = domain?.min ?? Math.min(...all);
	let max = domain?.max ?? Math.max(...all);
	if (min === max) {
		// A single price - otherwise this divides by zero and the line disappears.
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

// Rows from before the window are included too: the last price before the
// 30 days is the one in force on the window's first day.
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
