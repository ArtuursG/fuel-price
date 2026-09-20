// "Vai ir vērts pabraukt?" kalkulatora tīrās aprēķinu funkcijas (sk.
// docs/IZPETE.md 9.2 "Kalkulatoru formulas" - līkuma formula). Atdalītas no
// lapas koda, lai testē bez DOM, tāpat kā lib/calculator.ts un lib/sparkline.ts.
//
// Formula: neto ietaupījums = (P_tuvā - P_lētā) x L - d x c/100 x P_lētā
// P_tuvā/P_lētā milli-EUR/l, L litri, d papildu turp-atpakaļ attālums (km),
// c patēriņš (l/100km). Attālums sākumā ir taisnes attālums x 1,3
// (maršrutēšanas tuvinājums) - maršrutēšanas API apzināti nav izmantota,
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
// vai tikpat tuvu kā "tuvākais", nav nekāda liekā ceļa - d=0, nevis negatīvs
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

// --- Pilsētu saraksts sākumpunktam ---------------------------------------
// Ģeolokācija ne vienmēr ir pieejama: lietotājs var to liegt, pārlūks var
// to bloķēt, un uz stacionāra datora tā mēdz būt neprecīza vai lēna. Bez
// alternatīvas lapa tādā gadījumā nedara neko. Tāpēc no staciju adresēm
// atvasinām pilsētu sarakstu - pilsētas centrs ir tās staciju koordinātu
// vidējais punkts, kas salīdzinājumam "cik tālu jābrauc" ir gana precīzi.

export interface CityOrigin {
	name: string;
	lat: number;
	lon: number;
}

interface AddressedStation {
	address?: string | null;
	lat: number;
	lon: number;
}

/** Pilsēta ir tas, kas adresē seko pēdējam komatam; pasta indekss nost. */
export function cityFromAddress(address: string | null | undefined): string | null {
	if (!address) return null;
	// Pasta indekss mēdz stāvēt AIZ pilsētas ("..., Rīga, LV-1006"), tāpēc to
	// nogriežam no visas adreses, pirms meklējam pēdējo komatu.
	const withoutPostcode = address.replace(/LV-?\d{4}/gi, "").replace(/[\s,]+$/, "");
	if (!withoutPostcode.includes(",")) return null;
	const city = withoutPostcode
		.slice(withoutPostcode.lastIndexOf(",") + 1)
		.replace(/\s+/g, " ")
		.trim();
	// Cipars pilsētas vietā nozīmē, ka adrese sadalījās nepareizi.
	if (!city || /\d/.test(city)) return null;
	return city;
}

export function buildCityOrigins(stations: AddressedStation[], minStations = 2): CityOrigin[] {
	const groups = new Map<string, { lat: number; lon: number }[]>();
	for (const station of stations) {
		const city = cityFromAddress(station.address);
		if (!city || !Number.isFinite(station.lat) || !Number.isFinite(station.lon)) continue;
		const list = groups.get(city) ?? [];
		list.push({ lat: station.lat, lon: station.lon });
		groups.set(city, list);
	}

	const cities: CityOrigin[] = [];
	for (const [name, points] of groups) {
		if (points.length < minStations) continue;
		cities.push({
			name,
			lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
			lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
		});
	}
	return cities.sort((a, b) => a.name.localeCompare(b.name, "lv"));
}
