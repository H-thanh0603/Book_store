import { describe, it, expect } from "vitest";
import { normalizeCarrierStatus } from "./carriers";

describe("normalizeCarrierStatus", () => {
  it("maps ViettelPost numeric codes", () => {
    expect(normalizeCarrierStatus("VTP", 505)).toBe("DELIVERED");
    expect(normalizeCarrierStatus("VTP", 500)).toBe("CANCELLED");
    expect(normalizeCarrierStatus("VTP", 101)).toBe("SHIPPED");
    expect(normalizeCarrierStatus("VTP", 999)).toBeNull();
  });

  it("maps GHTK slugs", () => {
    expect(normalizeCarrierStatus("GHTK", "da_giao")).toBe("DELIVERED");
    expect(normalizeCarrierStatus("GHTK", "huy")).toBe("CANCELLED");
    expect(normalizeCarrierStatus("GHTK", "dang_giao")).toBe("SHIPPED");
    expect(normalizeCarrierStatus("GHTK", "something_new")).toBeNull();
  });
});
