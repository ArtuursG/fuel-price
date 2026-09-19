// Tīra SVG sparkline aprēķina funkcija -- atdalīta no komponentes, lai var
// vienības testēt bez DOM (tāpat kā lib/calculator.ts). Ar <2 punktiem
// atgriež null, NEVIS izgudro punktu -- karte to attēlo kā "vēl nav
// pietiekami daudz datu", nevis rāda maldīgu plakanu līniju no viena punkta.

export function buildSparklinePath(
	values: number[],
	width = 64,
	height = 24,
	padding = 2,
): string | null {
	if (values.length < 2) return null;

	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1; // visas vērtības vienādas -- izvairās no /0, dod taisnu līniju vidū
	const stepX = (width - padding * 2) / (values.length - 1);

	const points = values.map((v, i) => {
		const x = padding + i * stepX;
		const y = padding + (height - padding * 2) * (1 - (v - min) / range);
		return `${x.toFixed(2)},${y.toFixed(2)}`;
	});

	return `M${points.join(" L")}`;
}
