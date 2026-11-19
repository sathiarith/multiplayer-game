import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()], // lets tests import .jsx files
  test: {
    globalSetup: ["./server/pg/global-setup.js"],
    // Every server test copies a database; at the start of a run they all queue
    // for Postgres at once. Part 3 makes this faster; until then, allow for it.
    testTimeout: 15_000,
    hookTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["server/**/*.js", "shared/**/*.js"],
      exclude: [
        "**/*.test.js",
        "server/test-helpers.js",
        "server/index.js",
        "server/pg/test-db.js",
        "server/pg/global-setup.js",
      ],
      reporter: ["text", "html"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
