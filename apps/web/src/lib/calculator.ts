// Pure calculation functions for the "What does 100 km cost?" calculator (see
// docs/IZPETE.md 9.2, docs/PLAN.md phase 6). Kept apart from the page/UI code
// so they can be unit tested without Astro/DOM - that is the phase 6
// "done when" criterion ("calculator with unit-tested calculations").
//
// Prices are milli-EUR everywhere (see the price_milli convention), and so is
// the result - the page formats it with the same formatPrice() as the rest of
// the site.

export function fuelCostPer100km(priceMilliPerLiter: number, consumptionLPer100km: number): number {
	return priceMilliPerLiter * consumptionLPer100km;
}

export function evEnergyCostPer100km(priceMilliPerKwh: number, consumptionKwhPer100km: number): number {
	return priceMilliPerKwh * consumptionKwhPer100km;
}

// A time-based tariff (€/min) needs the power (kW) to know how long charging
// takes - without it €/min cannot be converted to €/100km.
export function evTimeCostPer100km(
	priceMilliPerMin: number,
	powerKw: number,
	consumptionKwhPer100km: number,
): number {
	if (powerKw <= 0) {
		throw new Error("powerKw jābūt pozitīvam");
	}
	const minutesNeeded = (consumptionKwhPer100km / powerKw) * 60;
	return priceMilliPerMin * minutesNeeded;
}

// --- Trip calculator ------------------------------------------------------
// Separate from the "per 100 km" comparison: here the user knows a specific
// distance and wants to know what it will cost.

export function litersForTrip(distanceKm: number, consumptionLPer100km: number): number {
	return (distanceKm * consumptionLPer100km) / 100;
}

export function tripCostMilli(
	distanceKm: number,
	consumptionLPer100km: number,
	priceMilliPerLiter: number,
): number {
	return litersForTrip(distanceKm, consumptionLPer100km) * priceMilliPerLiter;
}

export function costPerKmMilli(distanceKm: number, totalCostMilli: number): number {
	if (distanceKm <= 0) return 0;
	return totalCostMilli / distanceKm;
}

// Second mode: the user knows the distance driven and the litres filled, but
// not the consumption. Returns l/100 km.
export function consumptionFromLiters(distanceKm: number, liters: number): number {
	if (distanceKm <= 0) return 0;
	return (liters / distanceKm) * 100;
}

export function rangeKm(tankLiters: number, consumptionLPer100km: number): number {
	if (consumptionLPer100km <= 0) return 0;
	return (tankLiters / consumptionLPer100km) * 100;
}

// Tailpipe CO2 per litre. The values are commonly used fuel carbon factors,
// not measurements of a specific car, so the result is approximate.
const CO2_KG_PER_LITER: Record<string, number> = {
	P95: 2.31,
	P98: 2.31,
	E85: 1.56,
	DSL: 2.68,
	DSL_PLUS: 2.68,
	HVO: 0.4,
	LPG: 1.65,
};

export function co2KgForLiters(liters: number, product: string): number | null {
	const factor = CO2_KG_PER_LITER[product];
	if (factor === undefined) return null;
	return liters * factor;
}

export function periodCostMilli(
	dailyKm: number,
	days: number,
	consumptionLPer100km: number,
	priceMilliPerLiter: number,
): number {
	return tripCostMilli(dailyKm * days, consumptionLPer100km, priceMilliPerLiter);
}

// --- Comparison list -------------------------------------------------------

export interface CostRow {
	kind: "fuel" | "ev" | "home";
	/** Fuel or network. */
	name: string;
	/** Connector(s) or another qualifier. */
	detail: string | null;
	costMilli: number;
}

// A network's connectors with the same cost become one row ("CCS2, CHAdeMO")
// - otherwise the list was 19 rows long and half of them repeated the same
// figure. The result is sorted from the cheapest.
export function mergeSameCost(rows: CostRow[]): CostRow[] {
	const merged = new Map<string, CostRow>();
	for (const row of rows) {
		const key = `${row.kind}|${row.name}|${Math.round(row.costMilli)}`;
		const existing = merged.get(key);
		if (existing) {
			if (row.detail && !existing.detail?.split(", ").includes(row.detail)) {
				existing.detail = existing.detail ? `${existing.detail}, ${row.detail}` : row.detail;
			}
		} else {
			merged.set(key, { ...row });
		}
	}
	return [...merged.values()].sort((a, b) => a.costMilli - b.costMilli);
}
