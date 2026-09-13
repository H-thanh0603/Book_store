// Tests: agent_cart encode/parse round-trip, hostile inputs, and v2 HMAC
// signing (forged/tampered/unsigned params rejected; missing secret fails
// closed on both sides).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { encodeAgentCart, encodeAgentCartSigned, parseAgentCartParam } from "./agent-cart";

const lines = [
  { variantId: "v1", quantity: 2, name: "Sách A", price: 120000 },
  { variantId: "v2", quantity: 1 },
];

// Secret is set for the whole file: every parse path requires it.
beforeAll(() => {
  process.env.AGENT_CART_SECRET = "unit-test-secret-0123456789";
});
afterAll(() => {
  delete process.env.AGENT_CART_SECRET;
});

describe("agent_cart", () => {
  it("round-trips signed lines through the query param", () => {
    expect(parseAgentCartParam(encodeAgentCartSigned(lines))).toEqual(lines);
  });
  it("clamps quantities and drops bad lines", () => {
    const parsed = parseAgentCartParam(
      encodeAgentCartSigned([
        { variantId: "v1", quantity: 0 },
        { variantId: "", quantity: 3 },
        { variantId: "v2", quantity: 500 },
      ]),
    );
    expect(parsed).toEqual([
      { variantId: "v1", quantity: 1 },
      { variantId: "v2", quantity: 99 },
    ]);
  });
  it("caps at 50 lines", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ variantId: `v${i}`, quantity: 1 }));
    expect(parseAgentCartParam(encodeAgentCartSigned(many))).toHaveLength(50);
  });
});

describe("agent_cart signing", () => {
  it("rejects unsigned payloads (v1 format)", () => {
    expect(parseAgentCartParam(encodeAgentCart(lines))).toEqual([]);
  });
  it("rejects tampered payload with valid-looking tag", () => {
    const signed = encodeAgentCartSigned(lines);
    const dot = signed.lastIndexOf(".");
    const tamperedPayload = encodeAgentCart([{ variantId: "evil", quantity: 99 }]);
    expect(parseAgentCartParam(`${tamperedPayload}${signed.slice(dot)}`)).toEqual([]);
  });
  it("rejects garbage signatures and garbage params", () => {
    const signed = encodeAgentCartSigned(lines);
    const dot = signed.lastIndexOf(".");
    for (const bad of [null, "", "!!!", signed.slice(0, dot), `${signed}x`, "e30=", "W10=", `${encodeAgentCart(lines)}.forged-tag`]) {
      expect(parseAgentCartParam(bad)).toEqual([]);
    }
  });
  it("fails closed without a secret: no unsigned fallback", () => {
    const signed = encodeAgentCartSigned(lines);
    delete process.env.AGENT_CART_SECRET;
    expect(encodeAgentCartSigned(lines)).toBe("");
    // A signed param minted earlier (with a secret) still fails without one.
    expect(parseAgentCartParam(signed)).toEqual([]);
    process.env.AGENT_CART_SECRET = "unit-test-secret-0123456789";
  });
});
