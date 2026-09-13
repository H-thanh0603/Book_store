// Two-way server cart tests: pure helpers only (clamp, merge, phone).
import { describe, expect, it } from "vitest";
import { cleanCartLines, mergeCartLines, normalizeCartPhone } from "./server-cart";

describe("cleanCartLines", () => {
  it("keeps valid lines and clamps quantities", () => {
    expect(cleanCartLines([{ variantId: "v1", quantity: 3 }, { variantId: "v2", quantity: 0 }, { variantId: "v3", quantity: 500 }]))
      .toEqual([
        { variantId: "v1", quantity: 3 },
        { variantId: "v2", quantity: 1 },
        { variantId: "v3", quantity: 99 },
      ]);
  });
  it("drops garbage without crashing", () => {
    expect(cleanCartLines(null)).toEqual([]);
    expect(cleanCartLines("x")).toEqual([]);
    expect(cleanCartLines([{ quantity: 1 }, { variantId: "v1" }, 42])).toEqual([]);
    expect(cleanCartLines([{ variantId: "", quantity: 1 }])).toEqual([]);
  });
  it("caps at 50 lines", () => {
    expect(cleanCartLines(Array.from({ length: 80 }, (_, i) => ({ variantId: `v${i}`, quantity: 1 })))).toHaveLength(50);
  });
});

describe("mergeCartLines", () => {
  it("server wins conflicts, local-only lines kept", () => {
    const local = [
      { variantId: "a", quantity: 1 },
      { variantId: "b", quantity: 2 },
    ];
    const server = [
      { variantId: "a", quantity: 5 },
      { variantId: "c", quantity: 1 },
    ];
    expect(mergeCartLines(local, server).sort((x, y) => x.variantId.localeCompare(y.variantId)))
      .toEqual([
        { variantId: "a", quantity: 5 },
        { variantId: "b", quantity: 2 },
        { variantId: "c", quantity: 1 },
      ]);
  });
});

describe("normalizeCartPhone", () => {
  it("normalizes VN shapes to one core", () => {
    expect(normalizeCartPhone("+84 90 123 4567")).toBe("901234567");
    expect(normalizeCartPhone("0901234567")).toBe("901234567");
  });
});
