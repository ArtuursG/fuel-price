import { defineConfig } from "vitest/config";

// Plain Node test environment -- lib/calculator.ts is pure math with no
// Astro/DOM/D1 dependency, so it doesn't need @cloudflare/vitest-pool-workers
// (blocked on this machine anyway, see docs/DECISIONS.md ADR-008).
export default defineConfig({
	test: {
		environment: "node",
	},
});
