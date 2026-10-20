import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  { files: ["client/**/*.js"], languageOptions: { globals: globals.browser } },
  { files: ["server/**/*.js"], languageOptions: { globals: globals.node } },
  // shared/ gets no environment globals: no document, window, process, fetch...
];
