import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, type AuthContext } from "@/lib/auth";
import { withOrg } from "@/lib/org-scope";
import { apiError, ok, optStr } from "@/lib/api";
import { randomBytes } from "crypto";
import { emit, rearmDelivery } from "@/lib/webhook-bus";

// All queries are org-scoped via withOrg() (audit 2026-08-30 SEC-001): the
// legacy unscoped version let any staff account read another org's signing
// secret, redirect its endpoint URL, or rotate its secret. The secret column
// is also stripped from every response — it is only ever returned by the
// rotate action, once.

const ENDPOINT_COLUMNS = {
  id: true, orgId: true, provider: true, url: true, active: true,
  eventTypes: true, description: true, createdAt: true, updatedAt: true,
} as const;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("webhooks.read");
    const { id } = await ctx.params;
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: withOrg(auth, { id }),
      select: ENDPOINT_COLUMNS,
    });
    if (!endpoint) return ok({ error: "NOT_FOUND", message: "Endpoint not found" }, 404);
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { endpointId: endpoint.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    return ok({ endpoint, deliveries });
  } catch (e) { return apiError(e); }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("webhooks.manage");
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.url === "string") data.url = body.url;
    if (typeof body.active === "boolean") data.active = body.active;
    if (typeof body.description === "string") data.description = body.description;
    if (Array.isArray(body.eventTypes)) {
      data.eventTypes = body.eventTypes.filter((x: unknown) => typeof x === "string");
    }
    const row = await prisma.webhookEndpoint.update({
      where: { id: (await ownedEndpointId(auth, id))! },
      data,
      select: ENDPOINT_COLUMNS,
    });
    return ok(row);
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("webhooks.manage");
    const { id } = await ctx.params;
    await prisma.webhookEndpoint.delete({ where: { id: (await ownedEndpointId(auth, id))! } });
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
      await ownedEndpointId(auth, id);
      const secret = randomBytes(32).toString("hex");
      await prisma.webhookEndpoint.update({ where: { id }, data: { secret } });
      return ok({ secret, _note: "store the secret now; it will not be shown again" });
    }
    if (action === "test") {
      // Emit a synthetic event so the user can verify their endpoint. The
      // emit() call dedupes on eventId so re-running the test with the
      // same id is a no-op (use a fresh id if you want a real retry).
      const endpoint = await prisma.webhookEndpoint.findFirst({
        where: withOrg(auth, { id }), select: { orgId: true },
      });
      if (!endpoint) return ok({ error: "NOT_FOUND", message: "Endpoint not found" }, 404);
      const eventId = `test_${Date.now()}_${randomBytes(4).toString("hex")}`;
      const result = await emit({
        eventId,
        eventType: "webhook.test",
        orgId: endpoint.orgId,
        payload: { message: "Hello from Melio" },
      });
      return ok(result);
    }
    if (action === "rearm-delivery") {
      const deliveryId = optStr(body.deliveryId, "deliveryId");
      if (!deliveryId) return ok({ error: "VALIDATION", message: "deliveryId required" }, 400);
      // The delivery must belong to one of this org's endpoints.
      const delivery = await prisma.webhookDelivery.findFirst({
        where: auth.orgId
          ? { id: deliveryId, endpoint: { orgId: auth.orgId } }
          : { id: deliveryId },
        select: { id: true },
      });
      if (!delivery) return ok({ error: "NOT_FOUND", message: "Delivery not found" }, 404);
      await rearmDelivery(delivery.id);
      return ok({ rearmed: true });
    }
    return ok({ error: `unknown action: ${action}` }, 400);
  } catch (e) { return apiError(e); }
}

/** Resolve the id only if the endpoint belongs to the caller's org; null otherwise. */
async function ownedEndpointId(auth: AuthContext, id: string): Promise<string | null> {
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: withOrg(auth, { id }),
    select: { id: true },
  });
  if (!endpoint) throw Object.assign(new Error("Endpoint not found"), { status: 404 });
  return endpoint.id;
}
