// Merchant Agent endpoint — staff-only AI (commerce-agents merchant-agent).
// Read tools only: digest/explain/inventory/promo/catalog. Every write stays a
// staged change the human applies via existing APIs; the model never mutates.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api";
import { observeRequest } from "@/lib/metrics";
import {
  SKILL_PERMISSION,
  merchantConfigured,
  merchantProvenance,
  runMerchantTurn,
  type MerchantSkill,
} from "@/lib/merchant-agent";

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
      return NextResponse.json({ code: "NOT_CONFIGURED", message: "DEEPSEEK_API_KEY chưa cấu hình." }, { status: 503 });
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

    const contextJson = body?.context !== undefined ? JSON.stringify(body.context) : undefined;
    const { text, usage } = await runMerchantTurn(skill as MerchantSkill, history, contextJson);
    if (usage) {
      console.info(JSON.stringify({
        level: "info", event: "merchant_usage", skill,
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
