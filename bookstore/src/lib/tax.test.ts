import { describe, expect, it } from "vitest";
import { sumIncludedTax, taxIncludedIn } from "./tax";

describe("taxIncludedIn (VAT-inclusive breakdown)", () => {
  it("extracts 8% from a gross amount", () => {
    // 108000 gross @ 8% → net 100000, tax 8000
    expect(taxIncludedIn(108000n, 0.08)).toBe(8000n);
  });
  it("returns 0 for zero/negative gross or non-positive rate", () => {
    expect(taxIncludedIn(0n, 0.08)).toBe(0n);
    expect(taxIncludedIn(1000n, 0)).toBe(0n);
  });
  it("never exceeds the gross (truncates remainder)", () => {
    const gross = 99999n;
    expect(taxIncludedIn(gross, 0.08)).toBeLessThan(gross);
  });
  it("sums per-line rates independently", () => {
    expect(
      sumIncludedTax([
        { grossMinor: 108000n, rate: 0.08 },
        { grossMinor: 105000n, rate: 0.05 },
      ])
    ).toBe(8000n + 5000n);
  });
});
