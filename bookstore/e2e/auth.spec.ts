import { test, expect } from "@playwright/test";
import { E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD } from "./credentials";

// Staff auth against the account provisioned by e2e/global-setup.ts —
// deliberately not a seeded account (see e2e/credentials.ts).
test.describe("staff login", () => {
  test("e2e staff account logs in and leaves the login page", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_STAFF_EMAIL);
    await page.fill('input[type="password"]', E2E_STAFF_PASSWORD);
    await page.click('form button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText("Đăng nhập thất bại");
  });

  test("wrong password stays on login with an error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_STAFF_EMAIL);
    await page.fill('input[type="password"]', "not-the-password-123");
    await page.click('form button[type="submit"]');
    // The login page surfaces the API's message; "Đăng nhập thất bại" is only
    // the fallback when the response carries no message.
    await expect(page.locator("body")).toContainText("Invalid credentials", { timeout: 15_000 });
  });
});
