// Tests for PII scrubbing in lib/fencing.ts + memory input guard.
// Covers the P1 finding: 10-digit VN phones used to pass validation and
// render into every LLM turn; staff-pasted context leaked PII to providers.
import { describe, expect, it } from "vitest";
import { containsPii, redactPii } from "./fencing";
import { validateMemoryInput } from "./customer-memory";

describe("containsPii", () => {
  it("detects VN mobile numbers", () => {
    expect(containsPii("liên hệ 0901234567 nhé")).toBe(true);
    expect(containsPii("+84901234567")).toBe(true);
    expect(containsPii("090 123 4567")).toBe(true);
    expect(containsPii("090-123-4567")).toBe(true);
  });
  it("detects emails and card-like runs", () => {
    expect(containsPii("mail tôi là lan@example.com")).toBe(true);
    expect(containsPii("thẻ 1234567812345678")).toBe(true);
  });
  it("passes clean preference text", () => {
    expect(containsPii("thích tiểu thuyết của Nguyễn Nhật Ánh")).toBe(false);
    expect(containsPii("ngân sách khoảng 2 triệu")).toBe(false);
    expect(containsPii("")).toBe(false);
    expect(containsPii(undefined)).toBe(false);
  });
});

describe("redactPii", () => {
  it("masks phones and emails but keeps the rest", () => {
    const out = redactPii('gọi 0901234567 hoặc lan@example.com giúp mình');
    expect(out).not.toContain("0901234567");
    expect(out).not.toContain("lan@example.com");
    expect(out).toContain("[SĐT]");
    expect(out).toContain("[email]");
  });
  it("passes non-strings through as empty string", () => {
    expect(redactPii(42)).toBe("");
  });
});

describe("validateMemoryInput PII guard", () => {
  it("rejects values containing a phone number", () => {
    const r = validateMemoryInput("genre", "gọi tôi qua 0901234567");
    expect(r.ok).toBe(false);
  });
  it("rejects values containing an email", () => {
    const r = validateMemoryInput("author", "tác giả lan@example.com");
    expect(r.ok).toBe(false);
  });
  it("accepts clean values", () => {
    const r = validateMemoryInput("author", "Nguyễn Nhật Ánh");
    expect(r.ok).toBe(true);
  });
});
