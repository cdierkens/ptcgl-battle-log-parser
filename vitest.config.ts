import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Tests and test-support modules are not shipped code, so they are not
      // measured. The bundles live outside `src/` entirely now.
      exclude: ["src/**/__tests__/**"],
      reporter: ["text", "lcov"],
      // A floor, not a target. Set at the level the suite held when the API
      // froze, so coverage cannot silently regress. Deliberately not 100%:
      // the remaining branches are defensive, and chasing the last point
      // invites exclusions and tests written to satisfy a number.
      thresholds: {
        branches: 93,
        functions: 100,
        lines: 98,
        statements: 98,
      },
    },
  },
});
