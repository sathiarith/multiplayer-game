import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "**/dist/",
      "coverage/",
      "e2e/playwright-report/",
      "e2e/test-results/",
    ],
  },
  js.configs.recommended,
  {
    files: ["client/**/*.{js,jsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ["client/vite.config.js"],
    languageOptions: { globals: globals.node },
  },
  { files: ["server/**/*.js"], languageOptions: { globals: globals.node } },
  // Playwright runs in Node, but its page.evaluate() callbacks run in the browser.
  {
    files: ["e2e/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // shared/ gets no environment globals: no document, window, process, fetch...
];
