import { z } from "zod";

// --- Wire contract (mirrors collector/src/collector/core/models.py) ---

export const RunStatusSchema = z.enum([
	"ok",
	"not_modified",
	"partial",
	"error",
	"blocked",
	"unpublished",
]);

export const RunReportSchema = z.object({
	source_id: z.string(),
	started_at: z.string(),
	status: RunStatusSchema,
	finished_at: z.string().nullable().optional(),
	http_status: z.number().int().nullable().optional(),
	items: z.number().int().default(0),
	content_sha256: z.string().nullable().optional(),
	parser_version: z.string().nullable().optional(),
	error: z.string().nullable().optional(),
});

export const FuelPriceSchema = z.object({
	network_id: z.string(),
	scope: z.enum(["network", "station", "cheapest_riga", "cheapest"]),
	product: z.string(),
	price_milli: z.number().int().positive(),
	station_id: z.string().nullable().optional(),
	where_text: z.string().nullable().optional(),
	valid_from: z.string().nullable().optional(),
});

export const StationSchema = z.object({
	id: z.string(),
	network_id: z.string(),
	country: z.string().default("LV"),
	name: z.string().nullable().optional(),
	address: z.string().nullable().optional(),
	city: z.string().nullable().optional(),
	municipality: z.string().nullable().optional(),
	lat: z.number().nullable().optional(),
	lon: z.number().nullable().optional(),
	osm_id: z.string().nullable().optional(),
});

export const OfficialWeeklyPriceSchema = z.object({
	week_monday: z.string(),
	merchant: z.string(),
	product: z.string(),
	avg_price_milli: z.number().int().positive(),
	source_url: z.string(),
});

export const EvTariffSchema = z.object({
	network_id: z.string(),
	station_id: z.string().nullable().optional(),
	current_type: z.enum(["AC", "DC"]),
	payment: z.enum(["adhoc", "app", "subscription"]),
	power_min_kw: z.number().nullable().optional(),
	power_max_kw: z.number().nullable().optional(),
	connector: z.string().nullable().optional(),
	energy_milli_per_kwh: z.number().int().nullable().optional(),
	time_milli_per_min: z.number().int().nullable().optional(),
	session_fee_milli: z.number().int().nullable().optional(),
	min_fee_milli: z.number().int().nullable().optional(),
	idle_fee_milli_per_min: z.number().int().nullable().optional(),
	idle_after_min: z.number().int().nullable().optional(),
	time_from: z.string().nullable().optional(),
	time_to: z.string().nullable().optional(),
	weekdays: z.string().nullable().optional(),
	vat_included: z.boolean().default(true),
});

export const IngestBatchSchema = z.object({
	run: RunReportSchema,
	fuel: z.array(FuelPriceSchema).default([]),
	ev: z.array(EvTariffSchema).default([]),
	official_weekly: z.array(OfficialWeeklyPriceSchema).default([]),
	stations: z.array(StationSchema).default([]),
});

export type IngestBatch = z.infer<typeof IngestBatchSchema>;
export type FuelPriceInput = z.infer<typeof FuelPriceSchema>;
export type EvTariffInput = z.infer<typeof EvTariffSchema>;

// --- HMAC signing/verification ---
// Timestamp + "." + body, HMAC-SHA256, hex-encoded, "sha256=" prefixed.
// Must byte-for-byte match collector/src/collector/core/push.py.

const MAX_SKEW_MS = 5 * 60 * 1000; // Projekta konvencija: laika nobīde ne vairāk kā 5 min

async function hmacHex(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function computeSignature(secret: string, timestamp: string, body: string): Promise<string> {
	return `sha256=${await hmacHex(secret, `${timestamp}.${body}`)}`;
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

export async function verifySignature(
	secret: string,
	timestamp: string,
	body: string,
	providedSignature: string,
): Promise<boolean> {
	const expected = await computeSignature(secret, timestamp, body);
	return timingSafeEqual(expected, providedSignature);
}

export function isTimestampFresh(timestamp: string, now: Date = new Date(), maxSkewMs = MAX_SKEW_MS): boolean {
	const ts = new Date(timestamp);
	if (Number.isNaN(ts.getTime())) return false;
	return Math.abs(now.getTime() - ts.getTime()) <= maxSkewMs;
}

// --- Price change decision (ADR-004: only store on change; ADR-006: flag
// jumps but never withhold them) ---

const JUMP_THRESHOLD_PCT = 8.0;

export type PriceDecision =
	| { action: "no_change" }
	| { action: "insert"; flags: string | null };

export function decidePriceUpdate(previousMilli: number | null, newMilli: number): PriceDecision {
	if (previousMilli === null) {
		return { action: "insert", flags: null };
	}
	if (previousMilli === newMilli) {
		return { action: "no_change" };
	}
	const changePct = (Math.abs(newMilli - previousMilli) / previousMilli) * 100;
	return { action: "insert", flags: changePct >= JUMP_THRESHOLD_PCT ? "jump" : null };
}

// --- EV tariff change decision. Mirrors decidePriceUpdate's spirit (ADR-004:
// only store on change), but a tariff has many fields, not one price, so
// instead of comparing a single number we hash the price-defining fields and
// compare hashes. Not cryptographic -- just a compact equality check, same
// role as content_sha256 elsewhere in this file. The identity of a "slot"
// (what a tariff is FOR, as opposed to what it costs) is the caller's
// responsibility: see the ev_tariffs query in index.ts. ---

async function sha256Hex(message: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function computeTariffHash(tariff: EvTariffInput): Promise<string> {
	const canonical = JSON.stringify([
		tariff.power_min_kw ?? null,
		tariff.power_max_kw ?? null,
		tariff.energy_milli_per_kwh ?? null,
		tariff.time_milli_per_min ?? null,
		tariff.session_fee_milli ?? null,
		tariff.min_fee_milli ?? null,
		tariff.idle_fee_milli_per_min ?? null,
		tariff.idle_after_min ?? null,
		tariff.time_from ?? null,
		tariff.time_to ?? null,
		tariff.weekdays ?? null,
		tariff.vat_included,
	]);
	return sha256Hex(canonical);
}

export type TariffDecision = { action: "no_change" } | { action: "insert" };

export function decideTariffUpdate(previousHash: string | null, newHash: string): TariffDecision {
	return previousHash === newHash ? { action: "no_change" } : { action: "insert" };
}

// --- Europe/Riga local date, matching collector/src/collector/core/time.py ---

export function localDate(date: Date): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(date);
}
