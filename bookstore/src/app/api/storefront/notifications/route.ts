// Shopper notifications: onsite inbox + best-effort email outbox.
// GET  ?phone|customerId — PENDING/SENT notifications for the shopper.
// PUT  {id, read:true} — mark seen (status SENT onsite equivalent).
import { NextRequest } from "next/server";
import { apiError, fail, ok } from "@/lib/api";
import { agentRateLimit, finishAgentCall, type ResolvedAgentKey } from "@/lib/agent-auth";
import { prismaRead, prisma } from "@/lib/db";
import { normalizeCartPhone } from "@/lib/server-cart";

export async function GET(req: NextRequest) {
  const started = Date.now();
  let agentKey: ResolvedAgentKey | null = null;
  try {
    agentKey = await agentRateLimit(req, "shopper_notifications", "storefront-track", 20);
    const sp = req.nextUrl.searchParams;
    const phone = (sp.get("phone") ?? "").trim();
    const customerId = (sp.get("customerId") ?? "").trim();
    if (!phone && !customerId) fail(400, "VALIDATION", "Cần phone hoặc customerId");
    const rows = await prismaRead.shopperNotification.findMany({
      where: customerId
        ? { customerId, status: { in: ["PENDING", "SENT"] } }
        : { phone: normalizeCartPhone(phone), status: { in: ["PENDING", "SENT"] } },
      select: { id: true, kind: true, title: true, body: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    await finishAgentCall(req, "shopper_notifications", agentKey, started);
    return ok({ notifications: rows });
  } catch (error) {
    await finishAgentCall(req, "shopper_notifications", agentKey, started, error);
    return apiError(error);
  }
}

export async function PUT(req: NextRequest) {
  const started = Date.now();
  let agentKey: ResolvedAgentKey | null = null;
  try {
    agentKey = await agentRateLimit(req, "shopper_notifications", "storefront-track", 20);
    const body = (await req.json().catch(() => null)) as { id?: string; phone?: string; customerId?: string } | null;
    if (!body?.id) fail(400, "VALIDATION", "Thiếu id thông báo");
    // Owner proof: caller must replay the same phone/customerId the inbox was
    // fetched with. Without this anyone knowing a notification id could mark
    // (or probe) another shopper's inbox.
    const phone = (body.phone ?? "").trim();
    const customerId = (body.customerId ?? "").trim();
    if (!phone && !customerId) fail(400, "VALIDATION", "Cần phone hoặc customerId để xác nhận chủ sở hữu");
    const claimed = await prisma.shopperNotification.updateMany({
      where: {
        id: body.id,
        status: { in: ["PENDING", "SENT"] },
        ...(customerId ? { customerId } : { phone: normalizeCartPhone(phone) }),
      },
      data: { status: "SENT" },
    });
    if (claimed.count === 0) fail(404, "NOT_FOUND", "Thông báo không tồn tại");
    await finishAgentCall(req, "shopper_notifications", agentKey, started);
    return ok({ seen: true });
  } catch (error) {
    await finishAgentCall(req, "shopper_notifications", agentKey, started, error);
    return apiError(error);
  }
}
