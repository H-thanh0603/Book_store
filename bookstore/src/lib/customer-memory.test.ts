// B2 tests: memory validation (pure) + prompt block rendering.
import { describe, expect, it } from "vitest";
import {
  MEMORY_KEYS,
  normalizeMemoryPhone,
  renderMemoryBlock,
  validateMemoryInput,
} from "./customer-memory";

describe("validateMemoryInput", () => {
  it("accepts allowlisted keys and trims values", () => {
    expect(validateMemoryInput("genre", "  trinh thám  ")).toEqual({
      ok: true, key: "genre", value: "trinh thám",
    });
    expect(validateMemoryInput("AUTHOR", "Murakami")).toMatchObject({ ok: true, key: "author" });
  });
  it("rejects unknown keys without changing prompt bytes", () => {
    const res = validateMemoryInput("credit_card", "1234");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain(MEMORY_KEYS[0]);
  });
  it("rejects too-short values", () => {
    expect(validateMemoryInput("genre", "x")).toMatchObject({ ok: false });
  });
  it("refuses card-like digit runs instead of storing secrets", () => {
    const res = validateMemoryInput("budget", "thẻ của tôi 4111 1111 1111 1111");
    expect(res).toMatchObject({ ok: false });
  });
  it("caps values at 200 chars", () => {
    const res = validateMemoryInput("occasion", "a".repeat(500));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.length).toBeLessThanOrEqual(200);
  });
});

describe("normalizeMemoryPhone", () => {
  it("normalizes VN phone shapes to one core", () => {
    expect(normalizeMemoryPhone("+84 90 123 4567")).toBe(normalizeMemoryPhone("0901234567"));
    expect(normalizeMemoryPhone("84901234567")).toBe("901234567");
  });
});

describe("renderMemoryBlock", () => {
  it("renders empty for no memories and lines otherwise", () => {
    expect(renderMemoryBlock([])).toBe("");
    const block = renderMemoryBlock([{ key: "genre", value: "trinh thám", updatedAt: new Date() }]);
    expect(block).toContain("genre: trinh thám");
  });
});
