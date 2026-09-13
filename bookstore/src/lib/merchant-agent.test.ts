// Merchant Agent frame invariants: pure helpers + skill permission map.
import { describe, expect, it } from "vitest";
import {
  SKILL_PERMISSION,
  SKILL_PROMPTS,
  SKILL_TOOLS,
  detectListingIssues,
  filterSlowMovers,
} from "./merchant-agent";

describe("merchant skill permissions", () => {
  it("maps all five skills to real permission codes", () => {
    expect(Object.keys(SKILL_PERMISSION).sort()).toEqual(
      ["catalog", "digest", "explain", "inventory", "promo"].sort(),
    );
    expect(SKILL_PERMISSION.promo).toBe("promotion.manage");
    expect(SKILL_PERMISSION.catalog).toBe("product.update");
  });

  it("every skill prompt forbids model writes", () => {
    for (const p of Object.values(SKILL_PROMPTS)) {
      expect(p).toMatch(/không.*(sửa|gọi mutation)|staged|người.*duyệt/i);
    }
  });

  it("propose_change stages writes on four skills, never on explain", () => {
    const names = (s: keyof typeof SKILL_TOOLS) => SKILL_TOOLS[s].map((t) => t.function.name);
    for (const s of ["digest", "inventory", "promo", "catalog"] as const) {
      expect(names(s)).toContain("propose_change");
    }
    expect(names("explain")).not.toContain("propose_change");
  });
});

describe("filterSlowMovers", () => {
  it("keeps high-stock zero-sale rows, sorted by stock desc", () => {
    const rows = [
      { variantId: "a", sku: "A", name: "A", onHand: 50, sold30d: 0, price: 100 },
      { variantId: "b", sku: "B", name: "B", onHand: 5, sold30d: 0, price: 100 },
      { variantId: "c", sku: "C", name: "C", onHand: 30, sold30d: 4, price: 100 },
      { variantId: "d", sku: "D", name: "D", onHand: 80, sold30d: 0, price: null },
    ];
    const out = filterSlowMovers(rows);
    expect(out.map((r) => r.variantId)).toEqual(["d", "a"]);
  });
});

describe("detectListingIssues", () => {
  it("flags missing description/author/barcode/price", () => {
    const out = detectListingIssues([
      {
        productId: "p1", name: "Sách X", description: null, author: null, isBook: true,
        variants: [{ id: "v1", sku: "S1", barcodes: 0, hasPrice: false }],
      },
      {
        productId: "p2", name: "Bút", description: "Bút bi", author: null, isBook: false,
        variants: [{ id: "v2", sku: "S2", barcodes: 2, hasPrice: true }],
      },
    ]);
    expect(out.map((i) => i.kind).sort()).toEqual(
      ["missing_author", "missing_barcodes", "missing_description", "missing_price"].sort(),
    );
    expect(out).toHaveLength(4);
  });
});
