// Cenas `where_text` sadalīšana atsevišķās vietās. Katrs avots to raksta
// savādāk, un naiva sadalīšana pēc komata SABOJĀ daļu no tiem:
//
//   Circle K     "Brīvības gatve 265, Dzirciema iela 40"
//                -> komatu saraksts ar adresēm, bez pilsētas
//   Viada        "DUS Astras : G.Astras iela 7, Rīga, DUS Vecmīlgrāvis : Emmas iela 45, Rīga."
//                -> "nosaukums : iela, pilsēta" pāri, ATKAL atdalīti ar komatu,
//                   tāpēc komats atdala gan ierakstus, gan ielu no pilsētas
//   Straujupīte  "Ainaži, Salacgrīvas nov."
//                -> VIENA vieta, nevis divas. Sadalīšana pēc komata te uztaisītu
//                   divas neesošas "adreses" -- tieši tāpēc te ir baltais saraksts,
//                   nevis mēģinājums uzminēt no teksta formas.
//
// Ja formāts nav zināms, atgriežam tukšu sarakstu un lapa parāda tekstu tādu,
// kāds tas ir -- labāk viena nesadalīta rinda nekā izdomātas adreses.

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

	// "nosaukums : adrese" formāts -- ieraksts sākas tur, kur segmentā ir kols.
	if (text.includes(":")) {
		const places: FuelPlace[] = [];
		for (const segment of text.split(",")) {
			if (segment.includes(":")) {
				const [name, ...rest] = segment.split(":");
				places.push({ name: clean(name) || null, address: clean(rest.join(":")) });
			} else if (places.length > 0) {
				// Turpinājums iepriekšējam ierakstam (parasti pilsēta).
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

export function placeSearchUrl(networkName: string, place: FuelPlace): string {
	const query = [networkName, place.name, place.address].filter(Boolean).join(", ");
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${query}, Latvija`)}`;
}
