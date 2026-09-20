// Lētāko cenu piesaiste konkrētām stacijām kartē.
//
// Problēma: cena un stacija nāk no divām dažādām vietām. Cena nāk no tīkla
// lapas ar brīva teksta adresi ("Brīvības gatve 297, Rīga, LV-1006"),
// stacija -- no OpenStreetMap ar savu adreses pierakstu. Tās jāsavieno pēc
// teksta, un teksts nesakrīt burtiski: atšķiras pasta indeksi, pieturzīmes,
// un OSM tīkla nosaukums mēdz būt cits ("Virši-A" pret "Virši").
//
// Tāpēc saskaņošana prasa gan mājas numuru, gan vismaz vienu kopīgu ielas
// vārdu. Tikai numurs būtu par vāju (katrā pilsētā ir "10"), tikai ielas
// vārds arī (vienā ielā mēdz būt vairākas stacijas).
//
// Kur sakritības nav, stacija NETIEK izcelta un cena nonāk `unlocated`
// sarakstā, lai lapa to pateiktu skaidri. Nepareizi izcelta stacija ir
// sliktāka par neizceltu: cilvēks aizbrauktu uz nepareizo pusi.

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

// Pirmais skaitlis adresē ir mājas numurs; tālāk tekstā var būt pasta
// indekss vai citi cipari. Burts uzreiz aiz cipara pieder numuram ("25a"),
// bet aiz atstarpes -- vairs ne ("297 Rīga").
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

/** Lētākā cena katram produktam. row.prices ir šķirots augoši (sk. getLatestFuelPrices). */
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
	/** Vai izceltā ir absolūti lētākā, vai lētākā, ko izdevās novietot. */
	isAbsoluteCheapest: boolean;
	/** Aizpildīts tikai tad, ja lētākā nav novietojama. */
	cheaperNetworkName: string | null;
	cheaperPriceMilli: number | null;
}

export interface CheapestMarks {
	/** Stacijas id -> produkti, kuriem tur ir izceltā cena. */
	byStation: Map<string, string[]>;
	/** Pa vienam ierakstam katram produktam, ko izdevās novietot. */
	highlights: Highlight[];
}

interface StationLike {
	id: string;
	kind: "fuel" | "ev";
	network: string;
	address: string;
}

// Lētākā cena ne vienmēr ir piesienama stacijai: avots mēdz nosaukt tikai
// pagastu ("Ainaži, Salacgrīvas nov."), un tādas stacijas kartes datos nav.
// Tādā gadījumā ejam pa cenu sarakstu uz augšu līdz pirmajai, ko IZDODAS
// novietot, un pasakām, ka lētākā ir citur. Citādi tieši tie divi produkti,
// kas cilvēkus interesē visvairāk, kartē nebūtu izceļami vispār.
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

	// Tīkla mēroga cena ir spēkā visur, tāpēc adrese nav jāmeklē.
	if (price.scope === "network") return networkStations;

	const places = parseFuelPlaces(price.networkId, price.whereText);
	const addresses =
		places.length > 0 ? places.map((place) => place.address) : price.whereText ? [price.whereText] : [];

	return networkStations.filter((station) =>
		Boolean(station.address) && addresses.some((address) => addressMatches(address, station.address)),
	);
}
