import { describe, expect, it } from "vitest";
import {
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
