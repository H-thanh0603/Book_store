import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Runner for the DB-backed integration suite (scripts/tests/*). Separate from
// vitest.config.mjs because these hit the real Postgres/Redis from .env
// (src/lib/db loads dotenv itself) — they must never run in `npm test`.
// Scripts that additionally need the live dev server on :3000 (reset-flow,
// hardening) are skipped in the suite; run them via their own npm scripts
// with the app up.
export default defineConfig({
  test: {
    include: ["scripts/tests/integration-suite.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
