import { describe, expect, it } from "vitest";
import { addressMatches, addressTokens, cheapestByProduct, houseNumber, markCheapestStations, normalizeAddress } from "./cheapest";
import type { NetworkPrice, ProductRow } from "./prices";

const canonical = (name: string) => (name === "Virši-A" ? "Virši" : name);

function price(over: Partial<NetworkPrice> = {}): NetworkPrice {
	return {
		networkId: "viada", networkName: "Viada", priceMilli: 1897, scope: "cheapest",
		whereText: null, changeMilli: null, age: "today", observedAt: "2026-09-20T09:17:00Z",
		origin: "official_site", sourceUrl: null, validFrom: null, ...over,
	} as NetworkPrice;
}
const station = (id: string, network: string, address: string) => ({ id, kind: "fuel" as const, network, address });

describe("houseNumber", () => {
	it("ņem pirmo skaitli, ne pasta indeksu", () => {
		expect(houseNumber("Brīvības gatve 297, Rīga, LV-1006")).toBe("297");
	});
	it("tur kopā burtu, kas pielīp numuram", () => {
		expect(houseNumber("Anniņmuižas bulvāris 25a")).toBe("25a");
		expect(houseNumber("Eksporta iela 1C")).toBe("1c");
	});
	it("nepievieno burtu aiz atstarpes", () => {
		// "297 rīga" nedrīkst kļūt par "297 r".
		expect(houseNumber("Brīvības gatve 297 Rīga")).toBe("297");
	});
	it("atgriež null, ja numura nav", () => {
		expect(houseNumber("Ainaži, Salacgrīvas nov.")).toBeNull();
	});
});

describe("addressTokens", () => {
	it("izmet ielas veidu un pilsētas indeksu", () => {
		expect(addressTokens("Brīvības gatve 297, Rīga, LV-1006")).toEqual(new Set(["brīvības", "rīga"]));
	});
});

describe("addressMatches", () => {
	it("saskaņo, kad sakrīt numurs un ielas vārds", () => {
		expect(addressMatches("Brīvības gatve 297, Rīga, LV-1006", "Brīvības gatve 297, Rīga")).toBe(true);
	});
	it("NEsaskaņo vienādu numuru citā ielā", () => {
		expect(addressMatches("Dzirciema iela 40", "Kalnciema iela 40, Rīga")).toBe(false);
	});
	it("NEsaskaņo vienu ielu ar citu numuru", () => {
		expect(addressMatches("Brīvības gatve 265", "Brīvības gatve 203, Rīga")).toBe(false);
	});
	it("neatzīst adresi bez numura", () => {
		expect(addressMatches("Ainaži, Salacgrīvas nov.", "Ainaži")).toBe(false);
	});
});

describe("markCheapestStations", () => {
	const products: ProductRow[] = [
		{ product: "P95", label: "95", prices: [price({ whereText: "Brīvības gatve 297, Rīga, LV-1006", networkId: "virsi", networkName: "Virši", priceMilli: 1997 })] },
	];

	it("izceļ staciju, kad OSM tīkla nosaukums atšķiras", () => {
		// OSM to sauc "Virši-A"; bez canonical() sakritības nebūtu.
		const marks = markCheapestStations([station("s1", "Virši-A", "Brīvības gatve 297, Rīga")], products, canonical);
		expect(marks.byStation.get("s1")).toEqual(["P95"]);
		expect(marks.unlocated).toHaveLength(0);
	});

	it("neizceļ neko un ziņo, ja stacija nav atrodama", () => {
		const marks = markCheapestStations([station("s2", "Virši-A", "Brīvības gatve 250, Rīga")], products, canonical);
		expect(marks.byStation.size).toBe(0);
		expect(marks.unlocated).toEqual([
			{ product: "P95", networkName: "Virši", priceMilli: 1997, whereText: "Brīvības gatve 297, Rīga, LV-1006" },
		]);
	});

	it("tīkla mēroga cenai izceļ visas tīkla stacijas", () => {
		const networkWide: ProductRow[] = [
			{ product: "LPG", label: "LPG", prices: [price({ scope: "network", networkId: "virsi", networkName: "Virši", priceMilli: 905 })] },
		];
		const marks = markCheapestStations(
			[station("a", "Virši", "Kaut kur 1"), station("b", "Virši-A", "Citur 2"), station("c", "Viada", "Trešā 3")],
			networkWide,
			canonical,
		);
		expect([...marks.byStation.keys()].sort()).toEqual(["a", "b"]);
	});

	it("sadala Viada nosaukums-adrese pārus un izceļ abus", () => {
		const viada: ProductRow[] = [
			{ product: "LPG", label: "LPG", prices: [price({ priceMilli: 825, whereText: "ADUS Saharova : Andreja Saharova iela 10, Rīga, ADUS Valdeķu : Valdeķu iela 34, Rīga." })] },
		];
		const marks = markCheapestStations(
			[station("x", "Viada", "Andreja Saharova iela 10, Rīga"), station("y", "Viada", "Valdeķu iela 34, Rīga"), station("z", "Viada", "Cita iela 5, Rīga")],
			viada,
			canonical,
		);
		expect([...marks.byStation.keys()].sort()).toEqual(["x", "y"]);
	});

	it("neizceļ citu tīklu staciju ar tādu pašu adresi", () => {
		const marks = markCheapestStations([station("other", "Circle K", "Brīvības gatve 297, Rīga")], products, canonical);
		expect(marks.byStation.size).toBe(0);
	});
});

describe("cheapestByProduct", () => {
	it("ņem pirmo cenu, jo saraksts ir šķirots augoši", () => {
		const rows: ProductRow[] = [
			{ product: "P95", label: "95", prices: [price({ priceMilli: 1874 }), price({ priceMilli: 1897 })] },
		];
		expect(cheapestByProduct(rows).get("P95")?.priceMilli).toBe(1874);
	});
});

describe("normalizeAddress", () => {
	it("noņem pasta indeksu un pieturzīmes", () => {
		expect(normalizeAddress("Brīvības gatve 297, Rīga, LV-1006")).toBe("brīvības gatve 297 rīga");
	});
});
