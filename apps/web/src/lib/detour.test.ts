import { describe, expect, it } from "vitest";
import {
	buildCityOrigins,
	cityFromAddress,
	breakEvenExtraKm,
	detourNetSavingsMilli,
	extraRoundTripKm,
	haversineKm,
	nearestStation,
	roadDistanceEstimateKm,
} from "./detour";

describe("haversineKm", () => {
	it("returns 0 for the same point", () => {
		expect(haversineKm({ lat: 56.95, lon: 24.1 }, { lat: 56.95, lon: 24.1 })).toBe(0);
	});

	it("matches a known real-world distance (Riga to Jurmala, ~20km straight-line)", () => {
		// Riga center to Jurmala center, real coordinates
		const riga = { lat: 56.9496, lon: 24.1052 };
		const jurmala = { lat: 56.968, lon: 23.7714 };
		const km = haversineKm(riga, jurmala);
		expect(km).toBeGreaterThan(18);
		expect(km).toBeLessThan(23);
	});
});

describe("roadDistanceEstimateKm", () => {
	it("applies the documented 1.3x routing factor, not a made-up one", () => {
		expect(roadDistanceEstimateKm(10)).toBeCloseTo(13, 5);
	});
});

describe("nearestStation", () => {
	const origin = { lat: 56.95, lon: 24.1 };
	it("picks the closest of several candidates", () => {
		const far = { lat: 57.5, lon: 24.1, id: "far" };
		const near = { lat: 56.96, lon: 24.1, id: "near" };
		expect(nearestStation(origin, [far, near])?.id).toBe("near");
	});

	it("returns null for an empty list rather than throwing", () => {
		expect(nearestStation(origin, [])).toBeNull();
	});
});

describe("extraRoundTripKm", () => {
	it("doubles the one-way difference when the cheap station is farther", () => {
		expect(extraRoundTripKm(15, 5)).toBe(20); // (15-5) * 2
	});

	it("is zero, not negative, when the cheap station is actually closer", () => {
		// A negative d would mathematically inflate savings, which doesn't
		// reflect reality: if the "cheap" station is closer, there's no detour.
		expect(extraRoundTripKm(3, 10)).toBe(0);
	});
});

describe("detourNetSavingsMilli", () => {
	it("nets a real detour scenario correctly", () => {
		// Near station 1,984 EUR/l (real Circle K P98 this session), cheap
		// station 1,874 EUR/l (real Straujupite P95 this session, used here
		// purely as a second price point), 40l fill, 10km extra round trip,
		// 7 l/100km consumption.
		// gross = (1984-1874)*40 = 4400 milli; extra fuel = 10*0.07*1874 = 1311.8
		const result = detourNetSavingsMilli(1984, 1874, 40, 10, 7);
		expect(result).toBeCloseTo(4400 - 1311.8, 5);
	});

	it("is negative when the detour costs more than it saves", () => {
		expect(detourNetSavingsMilli(1900, 1850, 10, 200, 7)).toBeLessThan(0);
	});

	it("equals the gross difference when there is no extra distance", () => {
		expect(detourNetSavingsMilli(1984, 1874, 40, 0, 7)).toBe((1984 - 1874) * 40);
	});
});

describe("breakEvenExtraKm", () => {
	it("returns null when there is nothing to gain (same or higher price)", () => {
		expect(breakEvenExtraKm(1900, 1900, 40, 7)).toBeNull();
		expect(breakEvenExtraKm(1800, 1900, 40, 7)).toBeNull();
	});

	it("matches detourNetSavingsMilli's own zero-crossing", () => {
		const breakEven = breakEvenExtraKm(1984, 1874, 40, 7);
		expect(breakEven).not.toBeNull();
		const savingsAtBreakEven = detourNetSavingsMilli(1984, 1874, 40, breakEven!, 7);
		expect(savingsAtBreakEven).toBeCloseTo(0, 6);
	});
});

describe("cityFromAddress", () => {
	it("ņem to, kas seko pēdējam komatam", () => {
		expect(cityFromAddress("Brīvības gatve 297, Rīga")).toBe("Rīga");
	});
	it("nomet pasta indeksu", () => {
		expect(cityFromAddress("Brīvības gatve 297, Rīga, LV-1006")).toBe("Rīga");
	});
	it("atsakās, ja pilsētas vietā ir cipars", () => {
		expect(cityFromAddress("Ainaži, 4")).toBeNull();
	});
	it("atsakās bez komata", () => {
		expect(cityFromAddress("Ainaži")).toBeNull();
		expect(cityFromAddress(null)).toBeNull();
	});
});

describe("buildCityOrigins", () => {
	const stations = [
		{ address: "Iela 1, Rīga", lat: 56.9, lon: 24.1 },
		{ address: "Iela 2, Rīga", lat: 57.0, lon: 24.3 },
		{ address: "Iela 3, Cēsis", lat: 57.3, lon: 25.2 },
	];

	it("liek pilsētas centru staciju vidējā punktā", () => {
		const cities = buildCityOrigins(stations);
		expect(cities).toHaveLength(1);
		expect(cities[0].name).toBe("Rīga");
		expect(cities[0].lat).toBeCloseTo(56.95, 6);
		expect(cities[0].lon).toBeCloseTo(24.2, 6);
	});

	it("izlaiž pilsētu ar par maz stacijām", () => {
		// Cēsīs ir viena stacija, tāpēc vidējais punkts būtu tikai tā stacija.
		expect(buildCityOrigins(stations).map((c) => c.name)).not.toContain("Cēsis");
		expect(buildCityOrigins(stations, 1).map((c) => c.name)).toContain("Cēsis");
	});

	it("šķiro pēc latviešu alfabēta", () => {
		const cities = buildCityOrigins([...stations, { address: "Iela 4, Cēsis", lat: 57.3, lon: 25.2 }]);
		expect(cities.map((c) => c.name)).toEqual(["Cēsis", "Rīga"]);
	});
});
