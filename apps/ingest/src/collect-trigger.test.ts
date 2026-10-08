import { describe, expect, it } from "vitest";
import { COLLECT_DISPATCH_URL, collectDispatchRequest, scopeForTime, triggerCollect } from "./collect-trigger";

const at = (iso: string) => Date.parse(iso);

describe("scopeForTime", () => {
	it("collects fuel prices on an ordinary run", () => {
		expect(scopeForTime(at("2026-10-08T09:37:00Z"))).toBe("fuel");
	});
	it("adds the daily sources on the 04:07 UTC run only", () => {
		expect(scopeForTime(at("2026-10-08T04:07:00Z"))).toBe("all");
		expect(scopeForTime(at("2026-10-08T04:37:00Z"))).toBe("fuel");
		expect(scopeForTime(at("2026-10-08T05:07:00Z"))).toBe("fuel");
	});
});

describe("collectDispatchRequest", () => {
	it("asks GitHub to run collect.yml on main with the scope as input", async () => {
		const request = collectDispatchRequest("secret-token", "fuel");
		expect(request.url).toBe(COLLECT_DISPATCH_URL);
		expect(request.method).toBe("POST");
		expect(request.headers.get("Authorization")).toBe("Bearer secret-token");
		// GitHub rejects API requests without a User-Agent.
		expect(request.headers.get("User-Agent")).toBeTruthy();
		expect(await request.json()).toEqual({ ref: "main", inputs: { scope: "fuel" } });
	});
});

describe("triggerCollect", () => {
	it("does nothing without a token", async () => {
		let called = false;
		const result = await triggerCollect(at("2026-10-08T09:37:00Z"), undefined, async () => {
			called = true;
			return new Response(null, { status: 204 });
		});
		expect(result).toBe("no_token");
		expect(called).toBe(false);
	});

	it("reports success when GitHub queues the run", async () => {
		const result = await triggerCollect(at("2026-10-08T04:07:00Z"), "t", async (request) => {
			expect(await request.json()).toEqual({ ref: "main", inputs: { scope: "all" } });
			return new Response(null, { status: 204 });
		});
		expect(result).toBe("triggered");
	});

	it("reports a failure GitHub returns instead of hiding it", async () => {
		const result = await triggerCollect(at("2026-10-08T09:37:00Z"), "t", async () =>
			new Response('{"message":"Bad credentials"}', { status: 401 }),
		);
		expect(result).toBe("failed");
	});
});
