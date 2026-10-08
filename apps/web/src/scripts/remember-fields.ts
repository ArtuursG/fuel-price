// Remembers the car's details (consumption, tank, fuel type ...) between
// visits, so a driver does not type them again on every page or visit.
// Fields opt in with data-remember="<key>"; fields with the same key share
// one value, across pages and within a page (the calculator has two fuel
// consumption fields, and they describe the same car).
//
// The values stay in this browser's localStorage and are never sent anywhere.
// Storage can be unavailable (private mode, blocked site data), in which case
// the page simply works without remembering.

const STORAGE_KEY = "degvielas-cenas:car";

type Field = HTMLInputElement | HTMLSelectElement;

function readSaved(): Record<string, string> {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
		return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
	} catch {
		return {};
	}
}

function save(values: Record<string, string>): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
	} catch {
		// Storage is full or blocked - the page still works, it just forgets.
	}
}

function valueOf(field: Field): string {
	return field instanceof HTMLInputElement && field.type === "checkbox" ? (field.checked ? "1" : "") : field.value;
}

function setValue(field: Field, value: string): boolean {
	if (field instanceof HTMLSelectElement) {
		// A remembered fuel this page does not offer is left alone.
		if (![...field.options].some((option) => option.value === value)) return false;
		field.value = value;
		return true;
	}
	if (field.type === "checkbox") {
		field.checked = value === "1";
		return true;
	}
	// An empty or negative number would only produce a meaningless result.
	if (field.type === "number" && !(Number(value) > 0)) return false;
	field.value = value;
	return true;
}

/**
 * Fills the page's data-remember fields from earlier visits and saves them on
 * every change. Call it before the page's first render, so that render
 * already uses the remembered values.
 */
export function rememberFields(): void {
	const saved = readSaved();
	const fields = Array.from(document.querySelectorAll<HTMLElement>("[data-remember]")) as unknown as Field[];
	let syncing = false;

	for (const field of fields) {
		const value = saved[field.dataset.remember ?? ""];
		if (value !== undefined) setValue(field, value);
	}

	for (const field of fields) {
		const eventName = field instanceof HTMLSelectElement || field.type === "checkbox" ? "change" : "input";
		field.addEventListener(eventName, () => {
			if (syncing) return;
			const key = field.dataset.remember ?? "";
			const value = valueOf(field);
			saved[key] = value;
			save(saved);

			// Same key elsewhere on the page: update it and let its own
			// listeners recalculate. The flag stops the echo coming back here.
			syncing = true;
			for (const other of fields) {
				if (other === field || other.dataset.remember !== key || valueOf(other) === value) continue;
				if (setValue(other, value)) other.dispatchEvent(new Event(eventName, { bubbles: true }));
			}
			syncing = false;
		});
	}
}
