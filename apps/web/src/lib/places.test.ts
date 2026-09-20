import { describe, expect, it } from "vitest";
import { parseFuelPlaces, placeSearchUrl, placeWazeUrl } from "./places";

describe("parseFuelPlaces", () => {
	it("sadala Viada ierakstus, saglabājot pilsētu pie ielas", () => {
		const text = "DUS Dārzciema : Dārzciema iela 69, Rīga, DUS Dārzciema 2 : Dārzciema iela 62, Rīga.";
		expect(parseFuelPlaces("viada", text)).toEqual([
			{ name: "DUS Dārzciema", address: "Dārzciema iela 69, Rīga" },
			{ name: "DUS Dārzciema 2", address: "Dārzciema iela 62, Rīga" },
		]);
	});

	it("NEsadala Straujupītes vienu vietu divās", () => {
		// "Ainaži, Salacgrīvas nov." ir viena vieta - pagasts nav atsevišķa DUS.
		expect(parseFuelPlaces("straujupite", "Ainaži, Salacgrīvas nov.")).toEqual([]);
	});

	it("sadala Circle K komatu sarakstu", () => {
		const text = "Kārļa Ulmaņa gatve 117, Kārļa Ulmaņa gatve 127, Dzirciema iela 40";
		expect(parseFuelPlaces("circlek", text)).toEqual([
			{ name: null, address: "Kārļa Ulmaņa gatve 117" },
			{ name: null, address: "Kārļa Ulmaņa gatve 127" },
			{ name: null, address: "Dzirciema iela 40" },
		]);
	});

	it("atgriež tukšu sarakstu nezināmam tīklam bez kola", () => {
		expect(parseFuelPlaces("nezinams", "Kaut kāda vieta, ar komatu")).toEqual([]);
	});

	it("tiek galā ar tukšu un trūkstošu tekstu", () => {
		expect(parseFuelPlaces("circlek", null)).toEqual([]);
		expect(parseFuelPlaces("circlek", "   ")).toEqual([]);
	});

	it("neapstājas pie viena ieraksta bez pilsētas", () => {
		expect(parseFuelPlaces("viada", "DUS Astras : G.Astras iela 7")).toEqual([
			{ name: "DUS Astras", address: "G.Astras iela 7" },
		]);
	});

	it("saglabā adresi arī tad, ja nosaukuma nav", () => {
		expect(parseFuelPlaces("viada", " : Brīvības gatve 265, Rīga")).toEqual([
			{ name: null, address: "Brīvības gatve 265, Rīga" },
		]);
	});
});

describe("placeSearchUrl", () => {
	it("ieliek meklējumā tīklu, nosaukumu un adresi", () => {
		const url = placeSearchUrl("Viada", { name: "DUS Astras", address: "G.Astras iela 7, Rīga" });
		expect(url).toContain("google.com/maps/search/");
		expect(decodeURIComponent(url)).toContain("Viada, DUS Astras, G.Astras iela 7, Rīga, Latvija");
	});

	it("izlaiž nosaukumu, ja tā nav", () => {
		const url = placeSearchUrl("Circle K", { name: null, address: "Dzirciema iela 40" });
		expect(decodeURIComponent(url)).toContain("Circle K, Dzirciema iela 40, Latvija");
	});
});

describe("placeWazeUrl", () => {
	it("meklē pēc teksta, jo adresei nav koordinātu", () => {
		const url = placeWazeUrl("Viada", { name: "DUS Astras", address: "G.Astras iela 7, Rīga" });
		expect(url).toContain("waze.com/ul?q=");
		expect(url).toContain("navigate=yes");
		expect(decodeURIComponent(url)).toContain("Viada, DUS Astras, G.Astras iela 7, Rīga, Latvija");
	});

	it("nesūta lietotāja atrašanās vietu", () => {
		const url = placeWazeUrl("KOOL", { name: null, address: "Brīvības gatve 265" });
		expect(url).not.toContain("ll=");
		expect(url).not.toContain("from=");
	});
});
