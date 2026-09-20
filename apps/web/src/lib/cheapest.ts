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

export interface UnlocatedCheapest {
	product: string;
	networkName: string;
	priceMilli: number;
	whereText: string | null;
}

export interface CheapestMarks {
	/** Stacijas id -> produkti, kuriem tur ir zemākā zināmā cena. */
	byStation: Map<string, string[]>;
	/** Lētākās cenas, kurām stacija kartē nav atrodama. */
	unlocated: UnlocatedCheapest[];
}

interface StationLike {
	id: string;
	kind: "fuel" | "ev";
	network: string;
	address: string;
}

export function markCheapestStations(
	stations: StationLike[],
	products: ProductRow[],
	canonical: (name: string) => string,
): CheapestMarks {
	const byStation = new Map<string, string[]>();
	const unlocated: UnlocatedCheapest[] = [];

	const add = (stationId: string, product: string) => {
		const list = byStation.get(stationId) ?? [];
		if (!list.includes(product)) list.push(product);
		byStation.set(stationId, list);
	};

	for (const [product, price] of cheapestByProduct(products)) {
		const networkStations = stations.filter(
			(station) => station.kind === "fuel" && canonical(station.network) === price.networkName,
		);

		// Tīkla mēroga cena ir spēkā visur, tāpēc adrese nav jāmeklē.
		if (price.scope === "network") {
			if (networkStations.length === 0) {
				unlocated.push(toUnlocated(product, price));
				continue;
			}
			for (const station of networkStations) add(station.id, product);
			continue;
		}

		const places = parseFuelPlaces(price.networkId, price.whereText);
		const addresses = places.length > 0 ? places.map((place) => place.address) : price.whereText ? [price.whereText] : [];

		let found = 0;
		for (const address of addresses) {
			for (const station of networkStations) {
				if (station.address && addressMatches(address, station.address)) {
					add(station.id, product);
					found += 1;
				}
			}
		}
		if (found === 0) unlocated.push(toUnlocated(product, price));
	}

	return { byStation, unlocated };
}

function toUnlocated(product: string, price: NetworkPrice): UnlocatedCheapest {
	return {
		product,
		networkName: price.networkName,
		priceMilli: price.priceMilli,
		whereText: price.whereText,
	};
}
