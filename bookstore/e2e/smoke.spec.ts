import { test, expect } from "@playwright/test";

test("home page renders with brand and nav", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Melio Books/);
  await expect(page.locator("body")).toContainText("Nhà sách");
});

test("storefront catalog lists sellable products", async ({ page }) => {
  await page.goto("/shop");
  // The catalog is DB-backed; it must render at least one product card.
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main a, main article, main [data-product]").first()).toBeVisible();
});

test("login page renders the staff form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
