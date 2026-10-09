import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/templates/**"],
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
