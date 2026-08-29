import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, optStr } from "@/lib/api";
import { randomBytes } from "crypto";
import { emit, rearmDelivery } from "@/lib/webhook-bus";

/**
 * GET    /api/webhooks/[id]      — endpoint detail + recent deliveries
 * PATCH  /api/webhooks/[id]      — update url / active / eventTypes
 * DELETE /api/webhooks/[id]      — hard delete (cascades deliveries)
 * POST   /api/webhooks/[id]      — action router (rotate-secret, test, rearm)
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("webhooks.read");
    const { id } = await ctx.params;
    const endpoint = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id } });
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { endpointId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    return ok({ endpoint, deliveries });
  } catch (e) { return apiError(e); }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("webhooks.manage");
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.url === "string") data.url = body.url;
    if (typeof body.active === "boolean") data.active = body.active;
    if (typeof body.description === "string") data.description = body.description;
    if (Array.isArray(body.eventTypes)) {
      data.eventTypes = body.eventTypes.filter((x: unknown) => typeof x === "string");
    }
    const row = await prisma.webhookEndpoint.update({ where: { id }, data });
    return ok(row);
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("webhooks.manage");
    const { id } = await ctx.params;
    await prisma.webhookEndpoint.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("webhooks.manage");
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action = optStr(body.action, "action");

    if (action === "rotate-secret") {
      const secret = randomBytes(32).toString("hex");
      await prisma.webhookEndpoint.update({ where: { id }, data: { secret } });
      return ok({ secret, _note: "store the secret now; it will not be shown again" });
    }
    if (action === "test") {
      // Emit a synthetic event so the user can verify their endpoint. The
      // emit() call dedupes on eventId so re-running the test with the
      // same id is a no-op (use a fresh id if you want a real retry).
      const eventId = `test_${Date.now()}_${randomBytes(4).toString("hex")}`;
      const result = await emit({
        eventId,
        eventType: "webhook.test",
        orgId: auth.userId,
        payload: { message: "Hello from Melio" },
      });
      return ok(result);
    }
    if (action === "rearm-delivery") {
      const deliveryId = optStr(body.deliveryId, "deliveryId");
      await rearmDelivery(deliveryId);
      return ok({ rearmed: true });
    }
    return ok({ error: `unknown action: ${action}` }, 400);
  } catch (e) { return apiError(e); }
}
