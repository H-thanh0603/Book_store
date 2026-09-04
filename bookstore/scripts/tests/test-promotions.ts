// Promotion engine checks — pure math (mergeLineDiscounts) needs no DB;
// evaluatePromotions coverage lives in test-p0's promo claim race. Run: npm run test:promotions
import assert from "node:assert/strict";
import { mergeLineDiscounts, type AppliedPromo, type CartLine } from "../../src/lib/promotions";

const line = (variantId: string, unitPrice: bigint, quantity = 1): CartLine => ({
  variantId, productId: `p-${variantId}`, categoryId: "cat", quantity, unitPrice,
});

const promo = (id: string, discounts: [string, bigint][]): AppliedPromo => ({
  promoId: id, name: id, discountTotal: discounts.reduce((s, [, d]) => s + d, 0n),
  lineDiscounts: new Map(discounts),
});

// Percentage discount on a single line.
{
  const lines = [line("v1", 100_000n, 2)];
  const { total } = mergeLineDiscounts([promo("pct", [["v1", 20_000n]])], lines);
  assert.equal(total, 20_000n);
}

// Two stackable promos on the same line merge but never exceed line value.
{
  const lines = [line("v1", 50_000n)];
  const applied = [promo("a", [["v1", 30_000n]]), promo("b", [["v1", 40_000n]])];
  const { byVariant, total } = mergeLineDiscounts(applied, lines);
  assert.equal(byVariant.get("v1"), 50_000n); // capped at line value
  assert.equal(total, 50_000n);
}

// Discounts across different variants sum; each stays under its own cap.
{
  const lines = [line("v1", 10_000n), line("v2", 90_000n)];
  const applied = [promo("a", [["v1", 8_000n], ["v2", 9_000n]])];
  const { byVariant, total } = mergeLineDiscounts(applied, lines);
  assert.equal(byVariant.get("v1"), 8_000n);
  assert.equal(byVariant.get("v2"), 9_000n);
  assert.equal(total, 17_000n);
}

// Discount for an unknown variant is ignored (cap defaults to 0).
{
  const lines = [line("v1", 10_000n)];
  const { total } = mergeLineDiscounts([promo("ghost", [["nope", 5_000n]])], lines);
  assert.equal(total, 0n);
}

// No promos -> zero.
assert.equal(mergeLineDiscounts([], [line("v1", 1n)]).total, 0n);

console.log("Promotion merge/cap checks passed");
