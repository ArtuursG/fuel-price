// "Cik maksā nobraukt 100 km?" kalkulatora tīrās aprēķinu funkcijas (sk.
// docs/IZPETE.md 9.2, docs/PLAN.md 6. fāze). Atdalītas no lapas/UI koda, lai
// tās var vienības testēt bez Astro/DOM - tas ir 6. fāzes "gatavs, kad"
// kritērijs ("kalkulators ar vienības testiem aprēķiniem").
//
// Visur cenas ir milli-EUR (sk. price_milli konvenciju), tāpat arī rezultāts
// - lapa formatē ar to pašu formatPrice() kā pārējā vietne.

export function fuelCostPer100km(priceMilliPerLiter: number, consumptionLPer100km: number): number {
	return priceMilliPerLiter * consumptionLPer100km;
}

export function evEnergyCostPer100km(priceMilliPerKwh: number, consumptionKwhPer100km: number): number {
	return priceMilliPerKwh * consumptionKwhPer100km;
}

// Laika tarifam (€/min) vajag jaudu (kW), lai zinātu, cik ilgi uzlāde ņem
// - bez tās €/min nevar pārvērst par €/100km.
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

// --- Brauciena kalkulators ------------------------------------------------
// Atsevišķi no "uz 100 km" salīdzinājuma: te lietotājs zina konkrētu
// attālumu un grib zināt, cik tas maksās.

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

// Otrs režīms: lietotājs zina nobraukumu un uzpildītos litrus, bet ne
// patēriņu. Atgriež l/100 km.
export function consumptionFromLiters(distanceKm: number, liters: number): number {
	if (distanceKm <= 0) return 0;
	return (liters / distanceKm) * 100;
}

export function rangeKm(tankLiters: number, consumptionLPer100km: number): number {
	if (consumptionLPer100km <= 0) return 0;
	return (tankLiters / consumptionLPer100km) * 100;
}

// Izpūtēja CO2 uz litru. Vērtības ir vispārpieņemtie degvielas oglekļa
// koeficienti, nevis konkrēta auto mērījumi, tāpēc rezultāts ir aptuvens.
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
