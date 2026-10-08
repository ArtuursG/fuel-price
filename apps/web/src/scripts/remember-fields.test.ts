// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { rememberFields } from "./remember-fields";

const STORAGE_KEY = "degvielas-cenas:car";

function page(html: string): void {
	document.body.innerHTML = html;
}

// The Workers global `Element` (HTMLRewriter) clashes with the DOM `Element`,
// so DOM element types cannot be used as a generic constraint here.
function field<T>(id: string): T {
	return document.getElementById(id) as unknown as T;
}

function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("rememberFields", () => {
	beforeEach(() => localStorage.clear());

	it("keeps the page defaults on a first visit", () => {
		page('<input id="c" type="number" value="7" data-remember="consumption" />');
		rememberFields();
		expect(field<HTMLInputElement>("c").value).toBe("7");
	});

	it("restores a value saved on an earlier visit", () => {
		page('<input id="c" type="number" value="7" data-remember="consumption" />');
		rememberFields();
		type(field<HTMLInputElement>("c"), "5.8");

		page('<input id="c2" type="number" value="7" data-remember="consumption" />');
		rememberFields();
		expect(field<HTMLInputElement>("c2").value).toBe("5.8");
	});

	it("keeps fields with the same key in step and lets their own listeners run", () => {
		page(`
			<input id="trip" type="number" value="7" data-remember="consumption" />
			<input id="compare" type="number" value="7" data-remember="consumption" />
		`);
		rememberFields();
		let recalculated = 0;
		field<HTMLInputElement>("compare").addEventListener("input", () => recalculated++);

		type(field<HTMLInputElement>("trip"), "6.2");
		expect(field<HTMLInputElement>("compare").value).toBe("6.2");
		expect(recalculated).toBe(1);
	});

	it("ignores a remembered fuel the page does not offer", () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ product: "LPG" }));
		page('<select id="p" data-remember="product"><option value="P95">95</option><option value="DSL">D</option></select>');
		rememberFields();
		expect(field<HTMLSelectElement>("p").value).toBe("P95");
	});

	it("restores a remembered fuel the page offers", () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ product: "DSL" }));
		page('<select id="p" data-remember="product"><option value="P95">95</option><option value="DSL">D</option></select>');
		rememberFields();
		expect(field<HTMLSelectElement>("p").value).toBe("DSL");
	});

	it("does not restore an empty or zero number", () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ tank: "", consumption: "0" }));
		page(`
			<input id="t" type="number" value="50" data-remember="tank" />
			<input id="c" type="number" value="7" data-remember="consumption" />
		`);
		rememberFields();
		expect(field<HTMLInputElement>("t").value).toBe("50");
		expect(field<HTMLInputElement>("c").value).toBe("7");
	});

	it("survives unreadable storage", () => {
		localStorage.setItem(STORAGE_KEY, "{not json");
		page('<input id="c" type="number" value="7" data-remember="consumption" />');
		expect(() => rememberFields()).not.toThrow();
		expect(field<HTMLInputElement>("c").value).toBe("7");
	});
});
