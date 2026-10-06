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
  // Layer boundaries (monolith equivalent of twentyhq/twenty's package split:
  // twenty-ui / twenty-server / twenty-shared). The rules pin the boundaries
  // that already hold today:
  //   src/lib        server-side domain modules; routes call lib, never the reverse
  //   src/components reusable UI; may only touch client-safe lib modules
  //   src/app        the only layer allowed to compose lib + components
  {
    files: ["src/lib/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@/app/**", "../app/**", "../../app/**"],
            message: "lib is below app: routes call lib, never the reverse." },
          { group: ["@/components/**", "../components/**", "../../components/**"],
            message: "lib must not depend on UI components." },
        ],
      }],
    },
  },
  {
    files: ["src/components/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { regex: "^@/app/|^(\\./|\\.\\./)+(.*/)*app/",
            message: "components are shared; only app/ routes compose routes and pages." },
          // Allowlist inversion: everything under @/lib except the two
          // deliberately client-safe modules is server-side (Prisma/Redis/SMTP).
          { regex: "^@/lib/(?!csrf-client$|error-tracking$).+",
            message: "Only client-safe lib modules (csrf-client, error-tracking) may be imported by components; server modules would pull Prisma/Redis into the client bundle." },
          { regex: "^(\\./|\\.\\./)+(.*/)?lib/(?!csrf-client$|error-tracking$).+",
            message: "Import client-safe lib modules via the @/lib alias." },
        ],
      }],
    },
  },
  // Prisma discipline (invariants that hold today, now pinned — pattern from
  // twentyhq/twenty's custom oxlint rules: lint the rules your project owns):
  //   - exactly one PrismaClient/pool per process, built in src/lib/db.ts
  //   - the generated client is the only sanctioned Prisma import surface
  // Routes are the query layer: they use the shared instance from @/lib/db
  // together with the org-scope helpers (see docs/agents/skills/).
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: [
          { group: ["@prisma/client", "@prisma/client/*"],
            message: "Use the generated client (src/generated/prisma) — the @prisma/client package is not an import surface here." },
          { importNames: ["PrismaClient"], allowTypeImports: true,
            group: ["@/generated/prisma/client", "**/generated/prisma/client", "**/generated/prisma/client.*"],
            message: "Create the Prisma client only in src/lib/db.ts — one pool per process; import { prisma } from @/lib/db instead." },
        ],
      }],
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
