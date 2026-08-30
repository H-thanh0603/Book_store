import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Test files mock the Prisma client: the mock shapes are deliberately
  // loose (`as any` on row fixtures), so strict any-banning there is noise.
  {
    files: ["**/*.test.{ts,tsx}", "scripts/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Underscore-prefixed params/values are intentionally unused.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // react-hooks/set-state-in-effect (React Compiler-era rule, Next 16):
  // every admin page uses the classic fetch-in-`useEffect`-then-setState
  // pattern. Restructuring ~20 pages onto RSC/streaming is a planned
  // Phase-2 item (audit 2026-08-30 §11) — until then this rule is noise.
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
