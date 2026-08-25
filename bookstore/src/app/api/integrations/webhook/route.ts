import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { apiError, fail, ok } from "@/lib/api";
import { createReservedOrder, type CreateOrderInput } from "@/lib/orders";
import { claimIntegrationJob } from "@/lib/integration-jobs";
import { openSecret } from "@/lib/secret-box";

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
    // One generic message before the signature verifies — distinct errors would
    // let unauthenticated callers enumerate configured provider slugs.
    if (!provider || !provider.active || !provider.webhookSecret) fail(401, "VALIDATION", "Authentication failed");

    const expected = createHmac("sha256", openSecret(provider.webhookSecret)).update(raw).digest("hex");
    const got = req.headers.get("x-signature") ?? "";
    const a = Buffer.from(expected), b = Buffer.from(got);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      fail(401, "VALIDATION", "Authentication failed");

    const body = JSON.parse(raw) as { eventId?: string; event?: string; data?: unknown };
    if (typeof body.eventId !== "string" || typeof body.event !== "string" || !body.data)
      fail(400, "VALIDATION", "eventId, event and data required");

    const data = body.data as CreateOrderInput;
    const externalId = body.event === "order.created"
      ? data.externalId?.trim()
      : body.eventId;
    if (!externalId) fail(400, "VALIDATION", "order.created requires data.externalId");
    const idempotencyKey = body.event === "order.created"
      ? `${provider.name}:marketplace-order:${externalId}`
      : `${provider.name}:webhook:${body.eventId}`;
    const { job, claimed } = await claimIntegrationJob({
      provider: provider.name, kind: `WEBHOOK_${body.event.toUpperCase()}`,
      externalId, idempotencyKey, payload: body.data as object,
    });
    if (!claimed) return ok({ received: true, duplicate: true, jobId: job.id }, 202);

    try {
      const completed = await prisma.$transaction(async (tx) => {
        let result: { orderId?: string; number?: string; ignored?: boolean } = { ignored: true };
        if (body.event === "order.created") {
          const order = await createReservedOrder(
            { ...data, channel: "MARKETPLACE", externalId }, "webhook", tx,
          );
          result = { orderId: order.id, number: order.number };
        }
        return tx.integrationJob.update({
          where: { id: job.id },
          data: { status: "SUCCEEDED", result, completedAt: new Date(), error: null },
        });
      });
      return ok({ received: true, jobId: completed.id }, 202);
    } catch (error) {
      await prisma.integrationJob.updateMany({
        where: { id: job.id, status: "PROCESSING" },
        data: { status: "FAILED", error: error instanceof Error ? error.message : "Unknown webhook error", completedAt: new Date() },
      });
      throw error;
    }
  } catch (err) {
    return apiError(err);
  }
}
