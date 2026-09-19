// "Vai ir vērts pabraukt?" kalkulatora tīrās aprēķinu funkcijas (sk.
// docs/IZPETE.md 9.2 "Kalkulatoru formulas" -- līkuma formula). Atdalītas no
// lapas koda, lai testē bez DOM, tāpat kā lib/calculator.ts un lib/sparkline.ts.
//
// Formula: neto ietaupījums = (P_tuvā - P_lētā) x L - d x c/100 x P_lētā
// P_tuvā/P_lētā milli-EUR/l, L litri, d papildu turp-atpakaļ attālums (km),
// c patēriņš (l/100km). Attālums sākumā ir taisnes attālums x 1,3
// (maršrutēšanas tuvinājums) -- maršrutēšanas API apzināti nav izmantota,
// sk. pētījumu piezīmi ("API pievieno tikai tad, ja noteikumi/izmaksas to
// atļauj").

export interface StationLocation {
	lat: number;
	lon: number;
}

const EARTH_RADIUS_KM = 6371;
const ROUTING_FACTOR = 1.3; // taisnes attālums -> aptuvens ceļa attālums

export function haversineKm(a: StationLocation, b: StationLocation): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function roadDistanceEstimateKm(straightLineKm: number): number {
	return straightLineKm * ROUTING_FACTOR;
}

export function nearestStation<T extends StationLocation>(origin: StationLocation, stations: T[]): T | null {
	let nearest: T | null = null;
	let nearestKm = Infinity;
	for (const station of stations) {
		const km = haversineKm(origin, station);
		if (km < nearestKm) {
			nearest = station;
			nearestKm = km;
		}
	}
	return nearest;
}

// d (papildu turp-atpakaļ attālums): ja "lētākais" tīkls faktiski ir tuvāk
// vai tikpat tuvu kā "tuvākais", nav nekāda liekā ceļa -- d=0, nevis negatīvs
// (negatīvs d matemātiski uzpūstu ietaupījumu, kas neatbilst realitātei).
export function extraRoundTripKm(distanceToCheapKm: number, distanceToNearKm: number): number {
	return 2 * Math.max(0, distanceToCheapKm - distanceToNearKm);
}

export function detourNetSavingsMilli(
	nearPriceMilli: number,
	cheapPriceMilli: number,
	litersL: number,
	extraKm: number,
	consumptionLPer100km: number,
): number {
	const grossSavings = (nearPriceMilli - cheapPriceMilli) * litersL;
	const extraFuelCost = extraKm * (consumptionLPer100km / 100) * cheapPriceMilli;
	return grossSavings - extraFuelCost;
}

// Atmaksāšanās attālums: cik km drīkst būt papildu ceļš, lai ietaupījums
// tieši nokristu uz nulli (der parādīt lietotājam kā skaidru robežu).
export function breakEvenExtraKm(
	nearPriceMilli: number,
	cheapPriceMilli: number,
	litersL: number,
	consumptionLPer100km: number,
): number | null {
	const priceDiff = nearPriceMilli - cheapPriceMilli;
	if (priceDiff <= 0 || consumptionLPer100km <= 0) return null;
	const costPerKm = (consumptionLPer100km / 100) * cheapPriceMilli;
	if (costPerKm <= 0) return null;
	return (priceDiff * litersL) / costPerKm;
}
