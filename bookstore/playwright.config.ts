import "dotenv/config";
import { defineConfig } from "@playwright/test";

// E2E for the critical revenue flows (storefront catalog, staff auth).
// `npx playwright test` boots the dev server on :3000 itself; staff-login
// specs read SEED_USER_PASSWORD from the environment (seeded accounts:
// owner@melio.vn, manager.nh@melio.vn, ... — see prisma/seed.ts).
export default defineConfig({
  testDir: "e2e",
  globalSetup: "e2e/global-setup.ts",
  globalTeardown: "e2e/global-teardown.ts",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "npm run dev -- --port 3000",
    url: "http://localhost:3000",
    // The auth routes validate the Origin header against APP_ORIGIN (CSRF
    // guard). The local .env points APP_ORIGIN at the dev server's port
    // (often :3002); e2e runs on :3000, so it must match here.
    env: { ...process.env, APP_ORIGIN: "http://localhost:3000" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
