// "Cik maksā nobraukt 100 km?" kalkulatora tīrās aprēķinu funkcijas (sk.
// docs/IZPETE.md 9.2, docs/PLAN.md 6. fāze). Atdalītas no lapas/UI koda, lai
// tās var vienības testēt bez Astro/DOM -- tas ir 6. fāzes "gatavs, kad"
// kritērijs ("kalkulators ar vienības testiem aprēķiniem").
//
// Visur cenas ir milli-EUR (sk. price_milli konvenciju), tāpat arī rezultāts
// -- lapa formatē ar to pašu formatPrice() kā pārējā vietne.

export function fuelCostPer100km(priceMilliPerLiter: number, consumptionLPer100km: number): number {
	return priceMilliPerLiter * consumptionLPer100km;
}

export function evEnergyCostPer100km(priceMilliPerKwh: number, consumptionKwhPer100km: number): number {
	return priceMilliPerKwh * consumptionKwhPer100km;
}

// Laika tarifam (€/min) vajag jaudu (kW), lai zinātu, cik ilgi uzlāde ņem
// -- bez tās €/min nevar pārvērst par €/100km.
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
