// Anomaly + why-funnel unit tests: pure math pins the contracts.
import { describe, expect, it } from "vitest";
import { pctChange } from "./merchant-anomaly";

describe("pctChange", () => {
  it("computes drops and gains", () => {
    expect(pctChange(63, 100)).toBe(-37);
    expect(pctChange(108, 100)).toBe(8);
    expect(pctChange(100, 100)).toBe(0);
  });
  it("handles zero baselines without NaN", () => {
    expect(pctChange(5, 0)).toBe(100);
    expect(pctChange(0, 0)).toBeNull();
  });
});
