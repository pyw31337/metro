import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "prefer-const": "warn",
      "react/display-name": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["scripts/**/*.{js,ts,mjs,cjs}", "*.config.{js,ts,mjs,cjs}", "next.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".firebase/**",
    "data/raw/**",
    "downloads/**",
    "metro/**",
    "public/**",
  ]),
]);

export default eslintConfig;
