import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Cópias idênticas de packages/drive-web (tests/drive-web.test.mts confere): o estilo é o do pacote.
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "node_modules/**", "src/lib/drive-web/**", "public/drive-sw.js"]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
]);
