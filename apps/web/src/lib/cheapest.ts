// Ties the cheapest prices to specific stations on the map.
//
// The problem: the price and the station come from two different places. The
// price comes from the network's site with a free-text address ("Brīvības
// gatve 297, Rīga, LV-1006"), the station from OpenStreetMap with its own way
// of writing the address. They have to be joined on text, and the text does
// not match literally: postcodes and punctuation differ, and the OSM network
// name can be different too ("Virši-A" vs "Virši").
//
// So a match requires both the house number and at least one shared street
// word. The number alone would be too weak (every city has a "10"), and so
// would the street word alone (one street can have several stations).
//
// Where nothing matches, the station is NOT highlighted and the price ends up
// in the `unlocated` list, so the page can say so plainly. A wrongly
// highlighted station is worse than none: people would drive the wrong way.

import { parseFuelPlaces } from "./places";
import type { NetworkPrice, ProductRow } from "./prices";

export function normalizeAddress(value: string): string {
	return value
		.normalize("NFC")
		.toLocaleLowerCase("lv")
		.replace(/\blv-?\d{4}\b/g, " ")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

// The first number in an address is the house number; later in the text
// there may be a postcode or other digits. A letter right after the digits
// belongs to the number ("25a"), but not after a space ("297 Rīga").
export function houseNumber(value: string): string | null {
	const match = normalizeAddress(value).match(/\b\d+[\p{L}]?\b/u);
	return match ? match[0] : null;
}

const STOP_WORDS = new Set([
	"iela", "gatve", "bulvāris", "prospekts", "ceļš", "laukums", "šoseja",
	"nov", "novads", "pag", "pagasts", "dus", "adus", "lv",
]);

export function addressTokens(value: string): Set<string> {
	return new Set(
		normalizeAddress(value)
			.split(" ")
			.filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !/^\d+$/.test(word)),
	);
}

export function addressMatches(priceAddress: string, stationAddress: string): boolean {
	const number = houseNumber(priceAddress);
	if (!number || number !== houseNumber(stationAddress)) return false;
	const stationWords = addressTokens(stationAddress);
	for (const word of addressTokens(priceAddress)) {
		if (stationWords.has(word)) return true;
	}
	return false;
}

/** The cheapest price per product. row.prices is sorted ascending (see getLatestFuelPrices). */
export function cheapestByProduct(products: ProductRow[]): Map<string, NetworkPrice> {
	const cheapest = new Map<string, NetworkPrice>();
	for (const row of products) {
		const best = row.prices[0];
		if (best) cheapest.set(row.product, best);
	}
	return cheapest;
}

export interface Highlight {
	product: string;
	networkName: string;
	priceMilli: number;
	stationCount: number;
	/** Whether the highlighted price is the absolute cheapest or the cheapest that could be placed. */
	isAbsoluteCheapest: boolean;
	/** Only filled in when the cheapest cannot be placed. */
	cheaperNetworkName: string | null;
	cheaperPriceMilli: number | null;
}

export interface CheapestMarks {
	/** Station id -> products that have the highlighted price there. */
	byStation: Map<string, string[]>;
	/** One entry per product that could be placed. */
	highlights: Highlight[];
}

interface StationLike {
	id: string;
	kind: "fuel" | "ev";
	network: string;
	address: string;
}

// The cheapest price cannot always be tied to a station: a source may name
// only a parish ("Ainaži, Salacgrīvas nov."), and the map data has no such
// station. In that case we walk up the price list to the first one that CAN
// be placed, and say that the cheapest is elsewhere. Otherwise the very two
// products people care about most could not be highlighted on the map at all.
export function markCheapestStations(
	stations: StationLike[],
	products: ProductRow[],
	canonical: (name: string) => string,
): CheapestMarks {
	const byStation = new Map<string, string[]>();
	const highlights: Highlight[] = [];

	const add = (stationId: string, product: string) => {
		const list = byStation.get(stationId) ?? [];
		if (!list.includes(product)) list.push(product);
		byStation.set(stationId, list);
	};

	for (const row of products) {
		const cheapestOverall = row.prices[0];
		if (!cheapestOverall) continue;

		for (const [index, price] of row.prices.entries()) {
			const matches = locateStations(stations, price, canonical);
			if (matches.length === 0) continue;

			for (const station of matches) add(station.id, row.product);
			highlights.push({
				product: row.product,
				networkName: price.networkName,
				priceMilli: price.priceMilli,
				stationCount: matches.length,
				isAbsoluteCheapest: index === 0,
				cheaperNetworkName: index === 0 ? null : cheapestOverall.networkName,
				cheaperPriceMilli: index === 0 ? null : cheapestOverall.priceMilli,
			});
			break;
		}
	}

	return { byStation, highlights };
}

function locateStations(
	stations: StationLike[],
	price: NetworkPrice,
	canonical: (name: string) => string,
): StationLike[] {
	const networkStations = stations.filter(
		(station) => station.kind === "fuel" && canonical(station.network) === price.networkName,
	);

	// A network-wide price applies everywhere, so there is no address to match.
	if (price.scope === "network") return networkStations;

	const places = parseFuelPlaces(price.networkId, price.whereText);
	const addresses =
		places.length > 0 ? places.map((place) => place.address) : price.whereText ? [price.whereText] : [];

	return networkStations.filter((station) =>
		Boolean(station.address) && addresses.some((address) => addressMatches(address, station.address)),
	);
}
