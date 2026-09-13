// Tests for lib/agent-plan.ts — model-authored task plans.
import { describe, expect, it } from "vitest";
import { normalizePlan, renderPlanBlock } from "./agent-plan";

describe("normalizePlan", () => {
  it("accepts a valid plan and defaults missing status to pending", () => {
    expect(normalizePlan([{ title: "Tìm sách trinh thám" }, { title: "Chọn 3 món", status: "doing" }])).toEqual([
      { title: "Tìm sách trinh thám", status: "pending" },
      { title: "Chọn 3 món", status: "doing" },
    ]);
  });
  it("caps at 5 steps, trims titles, drops empties and junk", () => {
    const steps = [
      ...Array.from({ length: 8 }, (_, i) => ({ title: `Bước ${i}`, status: "done" })),
      { title: "   " },
      { title: "x".repeat(200) },
      null,
      "not-an-object",
    ];
    const plan = normalizePlan(steps);
    expect(plan).toHaveLength(5);
    // long titles are trimmed to 80 chars
    expect(normalizePlan([{ title: "x".repeat(200) }])?.[0].title).toHaveLength(80);
  });
  it("rejects unknown status values and non-arrays", () => {
    expect(normalizePlan([{ title: "A", status: "hacked" }])).toEqual([{ title: "A", status: "pending" }]);
    expect(normalizePlan(null)).toBeNull();
    expect(normalizePlan("plan")).toBeNull();
    expect(normalizePlan([])).toBeNull();
  });
});

describe("renderPlanBlock", () => {
  it("renders resume-style context with status icons", () => {
    const block = renderPlanBlock([
      { title: "Tìm sách", status: "done" },
      { title: "Chọn quà", status: "doing" },
    ]);
    expect(block).toContain("Kế hoạch hiện tại");
    expect(block).toContain("[✓] Tìm sách");
    expect(block).toContain("[→] Chọn quà");
  });
  it("returns empty string for an empty plan", () => {
    expect(renderPlanBlock([])).toBe("");
  });
});
