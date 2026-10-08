// Splits a price's `where_text` into separate places. Every source writes it
// differently, and a naive split on commas BREAKS some of them:
//
//   Circle K     "Brīvības gatve 265, Dzirciema iela 40"
//                -> a comma-separated list of addresses, no city
//   Viada        "DUS Astras : G.Astras iela 7, Rīga, DUS Vecmīlgrāvis : Emmas iela 45, Rīga."
//                -> "name : street, city" pairs, AGAIN separated by commas,
//                   so a comma separates both the entries and street from city
//   Straujupīte  "Ainaži, Salacgrīvas nov."
//                -> ONE place, not two. Splitting on the comma would make two
//                   "addresses" that do not exist - which is exactly why there
//                   is an allow-list here instead of guessing from the text.
//
// If the format is unknown we return an empty list and the page shows the text
// as it is - one unsplit line is better than invented addresses.

export interface FuelPlace {
	name: string | null;
	address: string;
}

const COMMA_LIST_NETWORKS = new Set(["circlek"]);

function clean(value: string): string {
	return value.trim().replace(/\.$/, "").trim();
}

export function parseFuelPlaces(networkId: string, whereText: string | null): FuelPlace[] {
	if (!whereText) return [];
	const text = whereText.trim();
	if (!text) return [];

	// "name : address" format - an entry starts where a segment has a colon.
	if (text.includes(":")) {
		const places: FuelPlace[] = [];
		for (const segment of text.split(",")) {
			if (segment.includes(":")) {
				const [name, ...rest] = segment.split(":");
				places.push({ name: clean(name) || null, address: clean(rest.join(":")) });
			} else if (places.length > 0) {
				// Continuation of the previous entry (usually the city).
				const previous = places[places.length - 1];
				const extra = clean(segment);
				if (extra) previous.address = `${previous.address}, ${extra}`;
			}
		}
		return places.filter((place) => place.address || place.name);
	}

	if (COMMA_LIST_NETWORKS.has(networkId)) {
		return text
			.split(",")
			.map((part) => clean(part))
			.filter(Boolean)
			.map((address) => ({ name: null, address }));
	}

	return [];
}

function placeQuery(networkName: string, place: FuelPlace): string {
	return `${[networkName, place.name, place.address].filter(Boolean).join(", ")}, Latvija`;
}

export function placeSearchUrl(networkName: string, place: FuelPlace): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeQuery(networkName, place))}`;
}

// An address has no coordinates, so Waze gets a search text (`q`) rather
// than `ll` as on the map. Both links carry only the destination - the
// user's location is never sent anywhere.
export function placeWazeUrl(networkName: string, place: FuelPlace): string {
	return `https://www.waze.com/ul?q=${encodeURIComponent(placeQuery(networkName, place))}&navigate=yes`;
}
