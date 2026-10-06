// Vitest runner for the DB-backed integration scripts. Each script executes
// as its own tsx child process: the scripts are top-level side-effect files
// that signal failure via exit code (`process.exit(1)` / `exitCode = 1`), so
// importing them as modules would both break isolation and hide failures —
// their main() is invoked fire-and-forget and the import resolves first.
//
// Only DB-only scripts are in the suite. test-p0, test-storefront,
// test-hardening and test-reset-flow additionally fetch HTTP routes on the
// live dev server (:3000/:3001) — run those via their own npm scripts
// (test:p0, test:storefront, test:hardening, test:reset) with the app up.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, "../..");

const DB_ONLY = ["test-phase3.ts", "test-promotions.ts", "test-pos-expiry.ts"];

for (const script of DB_ONLY) {
  test(script, () => {
    execFileSync("npx", ["tsx", path.join(dir, script)], {
      stdio: "inherit",
      cwd: repoRoot,
      // The scripts exit 0 on success; any non-zero exit throws and fails the test.
    });
  });
}
