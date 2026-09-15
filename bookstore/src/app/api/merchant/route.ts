// Merchant Agent endpoint — staff-only AI (commerce-agents merchant-agent).
// Read tools only: digest/explain/inventory/promo/catalog. Every write stays a
// staged change the human applies via existing APIs; the model never mutates.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api";
import { redactPii } from "@/lib/fencing";
import { observeRequest } from "@/lib/metrics";
import { merchantSwitches } from "@/lib/commerce";
import { llmModelId } from "@/lib/llm";
import { proposeStagedChange } from "@/lib/staged-changes";
import {
  SKILL_PERMISSION,
  merchantConfigured,
  merchantProvenance,
  runMerchantTurn,
  type MerchantSkill,
} from "@/lib/merchant-agent";
import { defaultOrgId } from "@/lib/org-scope";

const SKILLS: MerchantSkill[] = ["digest", "explain", "inventory", "promo", "catalog"];
const MERCHANT_DAILY_LIMIT = Number(process.env.MERCHANT_DAILY_LIMIT) || 500;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const finish = (status: number) => observeRequest("/api/merchant", "POST", status, Date.now() - startedAt);
  try {
    const auth = await requireAuth();

    const body = (await req.json().catch(() => null)) as {
      skill?: string;
      messages?: { role: "user" | "assistant"; content: string }[];
      context?: unknown;
    } | null;
    const skill = body?.skill;
    if (!skill || !(SKILLS as string[]).includes(skill)) {
      finish(400);
      return NextResponse.json({ code: "VALIDATION", message: `skill phải là một trong: ${SKILLS.join(", ")}` }, { status: 400 });
    }
    // Per-skill permission gate (same codes as the pages that apply the change).
    const needed = SKILL_PERMISSION[skill as MerchantSkill];
    const allowed = auth.roles.some((r) => r.permissions.includes(needed));
    if (!allowed) {
      finish(403);
      return NextResponse.json({ code: "FORBIDDEN", message: `Cần quyền ${needed}` }, { status: 403 });
    }

    if (!merchantConfigured()) {
      finish(503);
      return NextResponse.json({ code: "NOT_CONFIGURED", message: "LLM_API_KEY chưa cấu hình." }, { status: 503 });
    }

    const history = (body?.messages ?? [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-8);
    if (history.length === 0) {
      finish(400);
      return NextResponse.json({ code: "VALIDATION", message: "Thiếu nội dung tin nhắn" }, { status: 400 });
    }

    await enforceRateLimit("merchant-daily", "global", MERCHANT_DAILY_LIMIT, 24 * 60 * 60_000);
    await enforceRateLimit("merchant-user", auth.userId, 60, 60 * 60_000);

    // Context cap: staff-supplied context flows into the LLM prompt and the
    // staged payload — an oversized blob burns tokens and bloats rows.
    const rawContext = body?.context !== undefined ? JSON.stringify(body.context) : undefined;
    if (rawContext !== undefined && rawContext.length > 60_000) {
      finish(413);
      return NextResponse.json({ code: "VALIDATION", message: "context quá lớn (tối đa ~60KB)" }, { status: 413 });
    }
    // P1: staff paste revenue/customer JSON into context — mask phones and
    // emails before the text leaves for the third-party LLM provider.
    const contextJson = rawContext === undefined ? undefined : redactPii(rawContext);
    // Approval-surface wiring: propose_change stages PENDING rows attributed
    // to this staff user; nothing the model says applies itself.
    // defaultOrgId(): legacy org-less callers land on the seeded demo org —
    // never "the oldest org", which silently crossed tenants once a second
    // org existed (audit: cross-tenant leak via merchant agent).
    const orgId = auth.orgId ?? (await defaultOrgId());
    const permissions = auth.roles.flatMap((r) => r.permissions);
    const switches = merchantSwitches();
    const allowPropose =
      (skill === "promo" && (switches.enablePricing || switches.enableCampaigns)) ||
      ((skill === "digest" || skill === "inventory") && switches.enableInventory) ||
      (skill === "catalog" && switches.enableListingEdits);
    const { text, usage } = await runMerchantTurn(skill as MerchantSkill, history, contextJson, {
      allowPropose,
      scope: { orgId },
      propose: async (kind, title, payload) =>
        proposeStagedChange(kind, title, payload, { orgId, userId: auth.userId, permissions }),
    });
    if (usage) {
      console.info(JSON.stringify({
        level: "info", event: "merchant_usage", skill, model: llmModelId(),
        promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens,
      }));
    }
    finish(200);
    return NextResponse.json({
      text: text || "Mình chưa có câu trả lời phù hợp.",
      provenance: merchantProvenance("melio-merchant"),
    });
  } catch (error) {
    return apiError(error);
  }
}
