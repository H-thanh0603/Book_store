import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { apiError, fail, ok } from "@/lib/api";
import { createReservedOrder, type CreateOrderInput } from "@/lib/orders";

/**
 * Agent 4: signed inbound webhook for marketplace connectors.
 * Auth = HMAC-SHA256 over the raw body with the provider's webhookSecret,
 * sent as `X-Signature: <hex>`. No session — providers cannot log in.
 * Idempotent per (provider, eventId) through IntegrationJob.idempotencyKey.
 */
export async function POST(req: NextRequest) {
  try {
    const providerName = req.nextUrl.searchParams.get("provider") ?? "";
    const raw = await req.text();
    const provider = await prisma.integrationProvider.findUnique({ where: { name: providerName } });
    if (!provider || !provider.active || !provider.webhookSecret) fail(401, "VALIDATION", "Unknown or inactive provider");

    const expected = createHmac("sha256", provider.webhookSecret).update(raw).digest("hex");
    const got = req.headers.get("x-signature") ?? "";
    const a = Buffer.from(expected), b = Buffer.from(got);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      fail(401, "VALIDATION", "Invalid signature");

    const body = JSON.parse(raw) as { eventId?: string; event?: string; data?: unknown };
    if (typeof body.eventId !== "string" || typeof body.event !== "string" || !body.data)
      fail(400, "VALIDATION", "eventId, event and data required");

    const idempotencyKey = `${provider.name}:webhook:${body.eventId}`;
    const existing = await prisma.integrationJob.findUnique({ where: { idempotencyKey } });
    if (existing?.status === "SUCCEEDED") return ok({ received: true, duplicate: true });

    let result: { orderId?: string; number?: string; ignored?: boolean } = {};
    if (body.event === "order.created") {
      const order = await createReservedOrder(
        { ...(body.data as CreateOrderInput), channel: "MARKETPLACE" },
        "webhook",
      );
      result = { orderId: order.id, number: order.number };
    } else {
      // Unknown event types are recorded, not failed — reconciliation picks them up.
      result = { ignored: true };
    }

    const job = existing
      ? await prisma.integrationJob.update({
        where: { id: existing.id },
        data: { status: "SUCCEEDED", attempts: { increment: 1 }, result, completedAt: new Date(), error: null },
      })
      : await prisma.integrationJob.create({
        data: {
          provider: provider.name, kind: `WEBHOOK_${body.event.toUpperCase()}`,
          externalId: body.eventId, idempotencyKey,
          status: "SUCCEEDED", attempts: 1, payload: body.data as object, result, completedAt: new Date(),
        },
      });
    return ok({ received: true, jobId: job.id }, 202);
  } catch (err) {
    return apiError(err);
  }
}
