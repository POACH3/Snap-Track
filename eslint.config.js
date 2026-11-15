import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/dev-dist/",
    "apps/server/drizzle/",
    "tooling/boundary-fixtures/",
    "coverage/",
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Template literals with numbers are fine; the rest of the strict set stays on.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  { files: ["apps/server/**", "tooling/**", "*.{js,ts}"], languageOptions: { globals: globals.node } },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
    languageOptions: { globals: globals.browser },
  },
  { files: ["**/*.js", "**/*.mjs"], extends: [tseslint.configs.disableTypeChecked] },
);
