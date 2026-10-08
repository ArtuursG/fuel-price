// The small price chart on a card. Pure calculations, kept apart from the
// component so they can be tested without a DOM (like lib/calculator.ts).
//
// Two shapes, one scale:
//   "area" - a line with a fill and a highlighted last point (in use)
//   "bars" - one bar per observation, coloured by that day's direction
//
// SPARKLINE_STYLE picks the shape; switching to bars is a one-line change,
// since both shapes are computed from the same scale and the component draws
// whatever it receives.

export type SparklineStyle = "area" | "bars";
export const SPARKLINE_STYLE: SparklineStyle = "area";

export const SPARKLINE_WIDTH = 100;
export const SPARKLINE_HEIGHT = 22;

/** Up, down or unchanged - sets the chart colour. */
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

// Each card has its own scale: it compares a price with itself over time, not
// with other products, so a shared axis would mean nothing here (LPG and diesel
// on one axis would flatten both lines).
function buildScale(values: number[], width: number, height: number, padding: number): Scale {
	let min = Math.min(...values);
	let max = Math.max(...values);
	if (min === max) {
		// All values are equal - without this it would divide by zero.
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
	/** The line path; null when there is only one observation. */
	line: string | null;
	/** The fill path under the line; null when there is only one observation. */
	area: string | null;
	/** The last point - where the price is now. */
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

	// One observation: just a point. A line from a single point would be made
	// up, so there is none - the card next to it already says "first observation".
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
	/** Direction relative to the PREVIOUS observation, not the first one. */
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
