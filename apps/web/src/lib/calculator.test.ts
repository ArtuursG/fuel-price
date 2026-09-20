import { describe, expect, it } from "vitest";
import {
	co2KgForLiters,
	consumptionFromLiters,
	costPerKmMilli,
	evEnergyCostPer100km,
	evTimeCostPer100km,
	fuelCostPer100km,
	litersForTrip,
	periodCostMilli,
	rangeKm,
	tripCostMilli,
} from "./calculator";

describe("fuelCostPer100km", () => {
	it("multiplies price per litre by consumption", () => {
		// LV P95, ~1,976 EUR/l (real EU Weekly Oil Bulletin figure this session), 7 l/100km
		expect(fuelCostPer100km(1976, 7)).toBe(13832); // 13.832 EUR
	});

	it("returns 0 for 0 consumption", () => {
		expect(fuelCostPer100km(1976, 0)).toBe(0);
	});

	it("scales linearly with consumption", () => {
		expect(fuelCostPer100km(2000, 10)).toBe(2 * fuelCostPer100km(2000, 5));
	});
});

describe("evEnergyCostPer100km", () => {
	it("multiplies price per kWh by consumption", () => {
		// Elektrum Drive CCS2, real 0,230 EUR/kWh this session, 18 kWh/100km
		expect(evEnergyCostPer100km(230, 18)).toBe(4140); // 4.14 EUR
	});

	it("returns 0 for 0 consumption", () => {
		expect(evEnergyCostPer100km(230, 0)).toBe(0);
	});
});

describe("evTimeCostPer100km", () => {
	it("converts a per-minute tariff to a per-100km cost via charging power", () => {
		// e-mobi, real 0,190 EUR/min this session, 50 kW connector, 18 kWh/100km
		// -> 18/50 h = 21.6 min -> 0.19 * 21.6 = 4.104 EUR
		expect(evTimeCostPer100km(190, 50, 18)).toBeCloseTo(4104, 5);
	});

	it("costs more at lower power for the same energy need", () => {
		const slow = evTimeCostPer100km(190, 22, 18);
		const fast = evTimeCostPer100km(190, 50, 18);
		expect(slow).toBeGreaterThan(fast);
	});

	it("throws for non-positive power", () => {
		expect(() => evTimeCostPer100km(190, 0, 18)).toThrow();
		expect(() => evTimeCostPer100km(190, -10, 18)).toThrow();
	});

	it("roughly agrees with an equivalent per-kWh price at typical power", () => {
		// Sanity cross-check between the two pricing models: e-mobi's
		// 0,19 EUR/min at 50kW implies ~0,228 EUR/kWh, close to Elektrum
		// Drive's real 0,230 EUR/kWh CCS2 rate from the same snapshot -
		// not identical (different networks/pricing models), just plausible.
		const timeBasedCost = evTimeCostPer100km(190, 50, 18);
		const energyBasedCost = evEnergyCostPer100km(230, 18);
		expect(Math.abs(timeBasedCost - energyBasedCost)).toBeLessThan(200); // within 0.20 EUR
	});
});

describe("brauciena kalkulators", () => {
	it("rēķina vajadzīgos litrus", () => {
		expect(litersForTrip(250, 7)).toBeCloseTo(17.5);
		expect(litersForTrip(0, 7)).toBe(0);
	});

	it("rēķina brauciena izmaksas milli-EUR", () => {
		// 250 km pie 7 l/100km = 17.5 l; 17.5 * 1947 = 34072.5
		expect(tripCostMilli(250, 7, 1947)).toBeCloseTo(34072.5);
	});

	it("rēķina cenu uz kilometru un nedalās ar nulli", () => {
		expect(costPerKmMilli(250, 34072.5)).toBeCloseTo(136.29);
		expect(costPerKmMilli(0, 100)).toBe(0);
	});

	it("atvasina patēriņu no nobraukuma un litriem", () => {
		expect(consumptionFromLiters(400, 28)).toBeCloseTo(7);
		expect(consumptionFromLiters(0, 28)).toBe(0);
	});

	it("rēķina nobraucamo attālumu ar pilnu tvertni", () => {
		expect(rangeKm(50, 7)).toBeCloseTo(714.29, 1);
		expect(rangeKm(50, 0)).toBe(0);
	});

	it("rēķina aptuveno CO2 un klusē par nezināmu produktu", () => {
		expect(co2KgForLiters(10, "DSL")).toBeCloseTo(26.8);
		expect(co2KgForLiters(10, "P95")).toBeCloseTo(23.1);
		expect(co2KgForLiters(10, "ADBLUE")).toBeNull();
	});

	it("rēķina perioda izmaksas", () => {
		// 40 km dienā * 21 diena = 840 km
		expect(periodCostMilli(40, 21, 7, 1947)).toBeCloseTo(tripCostMilli(840, 7, 1947));
	});
});
