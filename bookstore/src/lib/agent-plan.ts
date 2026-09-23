// Model-authored task plan for multi-step concierge work (gap #2: the model
// could not plan — plan_combo was a fixed script). The model calls the
// `update_plan` tool with steps; this module validates and normalizes them.
// Plans persist as AgentChatTurn rows (role "plan") so state survives across
// turns, and the response carries the latest plan for UI progress rendering.
//
// Execution stays gated: the plan is a declaration, not a capability — every
// step still executes through the fixed allowlisted tools.
import { sanitizeUntrusted } from "./fencing";

export type PlanStepStatus = "pending" | "doing" | "done";

export type PlanStep = { title: string; status: PlanStepStatus };

const MAX_STEPS = 5;
const MAX_TITLE = 80;

const VALID_STATUS = new Set<PlanStepStatus>(["pending", "doing", "done"]);

/** Validate + normalize a model-supplied plan. Null when unusable. */
export function normalizePlan(input: unknown): PlanStep[] | null {
  if (!Array.isArray(input)) return null;
  const steps: PlanStep[] = [];
  for (const raw of input) {
    if (steps.length >= MAX_STEPS) break;
    if (typeof raw !== "object" || raw === null) continue;
    const rec = raw as Record<string, unknown>;
    const title = typeof rec.title === "string" ? rec.title.trim().slice(0, MAX_TITLE) : "";
    if (!title) continue;
    const status = typeof rec.status === "string" && VALID_STATUS.has(rec.status as PlanStepStatus)
      ? (rec.status as PlanStepStatus)
      : "pending";
    steps.push({ title, status });
  }
  return steps.length > 0 ? steps : null;
}

/** Render a plan block for the model context (resume-after-reload).
 *  P1-7: titles are model-writable and persisted — sanitize at render so a
 *  planted "system: ..." in a plan step cannot pose as system content on
 *  later turns (self-injection across reloads). */
export function renderPlanBlock(plan: PlanStep[]): string {
  if (plan.length === 0) return "";
  const icon = (s: PlanStepStatus) => (s === "done" ? "✓" : s === "doing" ? "→" : "○");
  return `\n\n## Kế hoạch hiện tại (do chính mình đặt ở lượt trước — tiếp tục, đừng lập lại từ đầu):\n${plan.map((p) => `- [${icon(p.status)}] ${sanitizeUntrusted(p.title)}`).join("\n")}`;
}
