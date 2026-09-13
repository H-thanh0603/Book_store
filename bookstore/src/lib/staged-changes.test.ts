// B3 tests: staged-change validators (pure) + status machine.
import { describe, expect, it } from "vitest";
import {
  canTransition,
  STAGED_KINDS,
  STAGED_PERMISSION,
  validateProductPatch,
  validatePromotionCreate,
  validateStagedPayload,
  validateSuggestionAccept,
} from "./staged-changes";

describe("validatePromotionCreate", () => {
  it("accepts sane drafts", () => {
    expect(validatePromotionCreate({ name: "Xả kho trinh thám", type: "percentage", value: 20 }))
      .toMatchObject({ ok: true });
  });
  it("enforces agent-side caps", () => {
    expect(validatePromotionCreate({ name: "x", type: "percentage", value: 50 }))
      .toMatchObject({ ok: false });
    expect(validatePromotionCreate({ name: "x", type: "fixed", value: 500_000 }))
      .toMatchObject({ ok: false });
    expect(validatePromotionCreate({ name: "x", type: "bogus", value: 5 }))
      .toMatchObject({ ok: false });
    expect(validatePromotionCreate({ name: "", type: "fixed", value: 5 }))
      .toMatchObject({ ok: false });
  });
});

describe("validateProductPatch", () => {
  it("accepts listing fixes and rejects scripts", () => {
    expect(validateProductPatch({ productId: "p1", description: "Mô tả sách hay đủ dài." }))
      .toMatchObject({ ok: true });
    expect(validateProductPatch({ productId: "p1", description: "ngắn" }))
      .toMatchObject({ ok: false });
    expect(validateProductPatch({ productId: "p1", description: "Mô tả <script>alert(1)</script> đủ dài nè" }))
      .toMatchObject({ ok: false });
    expect(validateProductPatch({ description: "Mô tả đủ dài nhưng thiếu id" }))
      .toMatchObject({ ok: false });
  });
});

describe("validateSuggestionAccept", () => {
  it("requires a suggestion id", () => {
    expect(validateSuggestionAccept({ suggestionId: "s1" })).toMatchObject({ ok: true });
    expect(validateSuggestionAccept({})).toMatchObject({ ok: false });
  });
});

describe("validateStagedPayload", () => {
  it("rejects unknown kinds", () => {
    const res = validateStagedPayload("order.refund", {});
    expect(res.ok).toBe(false);
  });
  it("covers all three kinds with permissions", () => {
    expect(STAGED_KINDS).toEqual(["promotion.create", "product.patch", "suggestion.accept"]);
    expect(STAGED_PERMISSION["promotion.create"]).toBe("promotion.manage");
    expect(STAGED_PERMISSION["product.patch"]).toBe("product.update");
    expect(STAGED_PERMISSION["suggestion.accept"]).toBe("purchase.create");
  });
});

describe("canTransition", () => {
  it("allows PENDING→APPROVED/REJECTED, APPROVED→APPLIED/FAILED, FAILED→APPROVED retry", () => {
    expect(canTransition("PENDING", "APPROVED")).toBe(true);
    expect(canTransition("PENDING", "REJECTED")).toBe(true);
    expect(canTransition("PENDING", "APPLIED")).toBe(false);
    expect(canTransition("APPROVED", "APPLIED")).toBe(true);
    expect(canTransition("APPROVED", "FAILED")).toBe(true);
    expect(canTransition("FAILED", "APPROVED")).toBe(true);
    expect(canTransition("APPLIED", "APPROVED")).toBe(false);
    expect(canTransition("REJECTED", "APPROVED")).toBe(false);
  });
});
