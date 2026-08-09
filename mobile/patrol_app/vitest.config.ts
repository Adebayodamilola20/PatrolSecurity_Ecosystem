import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // convex-test runs functions against an in-memory backend, so nothing here
    // touches a deployment. Edge-runtime matches what Convex actually runs.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
    testTimeout: 30000,
    setupFiles: ["./test-setup.ts"],
  },
});
