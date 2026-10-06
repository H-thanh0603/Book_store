// Playwright globalTeardown wrapper — see e2e/global-setup.ts for why this
// runs through tsx.
import { execFileSync } from "node:child_process";
import path from "node:path";

export default function globalTeardown() {
  execFileSync("npx", ["tsx", path.resolve(process.cwd(), "e2e/dispose.ts")], { stdio: "inherit" });
}
