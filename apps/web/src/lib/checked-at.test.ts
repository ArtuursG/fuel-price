import { describe, expect, it } from "vitest";
import { formatCheckedAt } from "./checked-at";

// 2026-10-08 12:00 in Riga (UTC+3).
const now = new Date("2026-10-08T09:00:00Z");

describe("formatCheckedAt", () => {
	it("says 'tikko' for the last two minutes", () => {
		expect(formatCheckedAt("2026-10-08T08:59:10Z", now)).toBe("tikko");
	});
	it("counts minutes within the hour", () => {
		expect(formatCheckedAt("2026-10-08T08:48:00Z", now)).toBe("pirms 12 min");
	});
	it("gives the Riga time for earlier today", () => {
		expect(formatCheckedAt("2026-10-08T06:37:00Z", now)).toBe("šodien 09:37");
	});
	it("uses the Riga calendar day, not UTC", () => {
		// 22:30 UTC on the 7th is already 01:30 on the 8th in Riga.
		expect(formatCheckedAt("2026-10-07T22:30:00Z", now)).toBe("šodien 01:30");
	});
	it("says 'vakar' for yesterday", () => {
		expect(formatCheckedAt("2026-10-07T18:07:00Z", now)).toBe("vakar 21:07");
	});
	it("falls back to the full date for older checks", () => {
		expect(formatCheckedAt("2026-10-05T18:07:00Z", now)).toBe("05.10.26 21:07");
	});
	it("does not claim freshness for a time in the future", () => {
		expect(formatCheckedAt("2026-10-08T09:30:00Z", now)).toBe("šodien 12:30");
	});
});
