// Pure calculation functions for the "Is it worth the drive?" calculator (see
// docs/IZPETE.md 9.2 "Calculator formulas" - the detour formula). Kept apart
// from the page code so they are tested without a DOM, like lib/calculator.ts
// and lib/sparkline.ts.
//
// Formula: net saving = (P_near - P_cheap) x L - d x c/100 x P_cheap
// P_near/P_cheap in milli-EUR/l, L litres, d extra round-trip distance (km),
// c consumption (l/100km). For now the distance is the straight-line distance
// x 1.3 (a routing approximation) - a routing API is deliberately not used,
// see the research note ("add an API only if its terms/costs allow it").

export interface StationLocation {
	lat: number;
	lon: number;
}

const EARTH_RADIUS_KM = 6371;
const ROUTING_FACTOR = 1.3; // straight-line distance -> approximate road distance

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

// d (extra round-trip distance): if the "cheapest" network is actually as
// close as or closer than the "nearest", there is no extra driving - d=0, not
// negative (a negative d would mathematically inflate the saving, which does
// not match reality).
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

// Break-even distance: how many km the extra drive may be before the saving
// drops to exactly zero (useful to show the user as a clear limit).
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

// --- City list for the starting point -------------------------------------
// Geolocation is not always available: the user can deny it, the browser can
// block it, and on a desktop computer it tends to be inaccurate or slow.
// Without an alternative the page would do nothing in that case. So a city
// list is derived from station addresses - a city's centre is the mean of its
// stations' coordinates, which is accurate enough for "how far do I drive".

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

/** The city is whatever follows the last comma in an address; the postcode is dropped. */
export function cityFromAddress(address: string | null | undefined): string | null {
	if (!address) return null;
	// The postcode often comes AFTER the city ("..., Rīga, LV-1006"), so it is
	// stripped from the whole address before looking for the last comma.
	const withoutPostcode = address.replace(/LV-?\d{4}/gi, "").replace(/[\s,]+$/, "");
	if (!withoutPostcode.includes(",")) return null;
	const city = withoutPostcode
		.slice(withoutPostcode.lastIndexOf(",") + 1)
		.replace(/\s+/g, " ")
		.trim();
	// A digit in place of the city means the address was split wrongly.
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
