import { defineConfig } from "vitest/config";

// Plain Node test environment, not @cloudflare/vitest-pool-workers -- see
// docs/DECISIONS.md ADR-008: this machine's Windows Application Control
// policy blocks the workerd binary that pool-workers needs. Hono's app
// stays runtime-agnostic so its routing/validation logic is fully testable
// here; D1-binding-specific behavior gets exercised in CI instead.
export default defineConfig({
  test: {
    environment: "node",
  },
});
