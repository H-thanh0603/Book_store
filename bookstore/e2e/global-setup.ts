// Playwright globalSetup wrapper. The actual provisioning lives in
// e2e/provision.ts and runs under tsx: Playwright's own TS loader cannot
// handle the ES-module Prisma 7 generated client that src/lib/db imports.
import { execFileSync } from "node:child_process";
import path from "node:path";

export default function globalSetup() {
  execFileSync("npx", ["tsx", path.resolve(process.cwd(), "e2e/provision.ts")], { stdio: "inherit" });
}
