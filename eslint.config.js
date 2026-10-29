import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["**/dist/", "coverage/"] },
  js.configs.recommended,
  {
    files: ["client/**/*.{js,jsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  { files: ["server/**/*.js"], languageOptions: { globals: globals.node } },
  // shared/ gets no environment globals: no document, window, process, fetch...
];
