// Concierge/merchant answer feedback: thumbs up/down from the chat UI.
// Public (concierge is public) — best-effort identity: session customer when
// present, else sha256 of client IP (raw IP never stored). One row per click;
// the weekly review reads it grouped by agent + model.
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { apiError, fail, ok } from "@/lib/api";
import { getCustomerAuth } from "@/lib/customer-auth";
import { llmModelId } from "@/lib/llm";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

const MAX_TEXT = 2000;

async function orgIdFor(): Promise<string> {
  const store = await prisma.store.findFirst({
    where: { active: true },
    orderBy: { code: "asc" },
    select: { region: { select: { orgId: true } } },
  });
  if (!store) fail(503, "NO_STORE", "No active store configured");
  return store.region.orgId;
}

export async function POST(req: NextRequest) {
  try {
    // Cheap spam bound: one verdict per IP per 10s, 60/hour.
    await enforceRateLimit("agent-feedback-ip", clientIp(req.headers), 6, 10 * 60_000);
    await enforceRateLimit("agent-feedback-hour", clientIp(req.headers), 60, 60 * 60_000);

    const body = (await req.json().catch(() => null)) as {
      rating?: string;
      agent?: string;
      turnText?: string;
      note?: string;
    } | null;
    const rating = body?.rating === "up" || body?.rating === "down" ? body.rating : null;
    if (!rating) fail(400, "VALIDATION", "rating phải là 'up' hoặc 'down'");
    const agent = body?.agent === "merchant" ? "merchant" : "concierge";

    const session = await getCustomerAuth();
    const orgId = await orgIdFor();
    await prisma.agentFeedback.create({
      data: {
        orgId,
        ...(session ? { customerId: session.customerId } : { ipHash: createHash("sha256").update(clientIp(req.headers)).digest("hex") }),
        rating,
        agent,
        modelId: llmModelId(),
        ...(typeof body?.turnText === "string" && body.turnText.trim() ? { turnText: body.turnText.slice(0, MAX_TEXT) } : {}),
        ...(typeof body?.note === "string" && body.note.trim() ? { note: body.note.slice(0, MAX_TEXT) } : {}),
      },
    });
    return ok({ recorded: true }, 201);
  } catch (error) {
    return apiError(error);
  }
}
