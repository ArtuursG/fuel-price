// Mazais cenu grafiks kartītē. Tīri aprēķini, atdalīti no komponentes, lai
// tos var testēt bez DOM (tāpat kā lib/calculator.ts).
//
// Divas formas, viens mērogs:
//   "area" -- līnija ar pildījumu un izceltu pēdējo punktu (izmantotā)
//   "bars" -- viens stabiņš par novērojumu, krāsots pēc dienas virziena
//
// Formu izvēlas SPARKLINE_STYLE; pāreja uz stabiņiem ir šīs vienas rindas
// maiņa, jo abas formas rēķinās no tā paša mēroga un komponente zīmē to,
// ko saņem.

export type SparklineStyle = "area" | "bars";
export const SPARKLINE_STYLE: SparklineStyle = "area";

export const SPARKLINE_WIDTH = 100;
export const SPARKLINE_HEIGHT = 22;

/** Uz augšu, uz leju vai bez izmaiņām -- nosaka grafika krāsu. */
export type PriceDirection = "up" | "down" | "flat";

export function sparklineDirection(values: number[]): PriceDirection {
	if (values.length < 2) return "flat";
	const delta = values[values.length - 1] - values[0];
	return delta < 0 ? "down" : delta > 0 ? "up" : "flat";
}

interface Scale {
	x: (index: number) => number;
	y: (value: number) => number;
}

// Katrai kartītei savs mērogs: salīdzina cenu ar sevi laikā, nevis ar citiem
// produktiem, tāpēc kopīga ass te nozīmi nedotu (LPG un dīzelis vienā asī
// padarītu abas līnijas plakanas).
function buildScale(values: number[], width: number, height: number, padding: number): Scale {
	let min = Math.min(...values);
	let max = Math.max(...values);
	if (min === max) {
		// Visas vērtības vienādas -- bez šī dalītu ar nulli.
		min -= 1;
		max += 1;
	}
	const stepX = values.length > 1 ? width / (values.length - 1) : 0;
	return {
		x: (index) => (values.length > 1 ? index * stepX : width / 2),
		y: (value) => height - ((value - min) / (max - min)) * (height - padding * 2) - padding,
	};
}

export interface SparklineArea {
	/** Līnijas ceļš; null, ja ir tikai viens novērojums. */
	line: string | null;
	/** Pildījuma ceļš zem līnijas; null, ja ir tikai viens novērojums. */
	area: string | null;
	/** Pēdējais punkts -- tas, kur cena ir tagad. */
	last: { x: number; y: number };
	direction: PriceDirection;
}

export function buildSparklineArea(
	values: number[],
	width = SPARKLINE_WIDTH,
	height = SPARKLINE_HEIGHT,
	padding = 1.5,
): SparklineArea | null {
	if (values.length === 0) return null;
	const scale = buildScale(values, width, height, padding);
	const direction = sparklineDirection(values);

	// Viens novērojums: tikai punkts. Līnija no viena punkta būtu izdomāta,
	// tāpēc tās nav -- kartīte blakus jau saka "pirmā novērošana".
	if (values.length === 1) {
		return { line: null, area: null, last: { x: width / 2, y: height / 2 }, direction };
	}

	const line = values
		.map((value, i) => `${i === 0 ? "M" : "L"}${scale.x(i).toFixed(2)} ${scale.y(value).toFixed(2)}`)
		.join(" ");

	return {
		line,
		area: `${line} L${width} ${height} L0 ${height} Z`,
		last: { x: scale.x(values.length - 1), y: scale.y(values[values.length - 1]) },
		direction,
	};
}

export interface SparklineBar {
	x: number;
	y: number;
	width: number;
	height: number;
	/** Virziens pret IEPRIEKŠĒJO novērojumu, ne pret sākumu. */
	direction: PriceDirection;
}

export function buildSparklineBars(
	values: number[],
	width = SPARKLINE_WIDTH,
	height = SPARKLINE_HEIGHT,
	padding = 1.5,
): SparklineBar[] {
	if (values.length === 0) return [];
	const scale = buildScale(values, width, height, padding);
	const gap = values.length > 12 ? 0.6 : 1.6;
	const barWidth = Math.max((width - gap * (values.length - 1)) / values.length, 0.8);

	return values.map((value, i) => {
		const previous = i > 0 ? values[i - 1] : value;
		const y = scale.y(value);
		return {
			x: i * (barWidth + gap),
			y,
			width: barWidth,
			height: height - y,
			direction: value < previous ? "down" : value > previous ? "up" : "flat",
		};
	});
}
