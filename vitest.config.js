import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["server/**/*.js", "shared/**/*.js"],
      exclude: ["**/*.test.js", "server/test-helpers.js", "server/index.js"],
      reporter: ["text", "html"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
