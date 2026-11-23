import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { apiError, fail, ok } from "@/lib/api";
import { createReservedOrder, type CreateOrderInput } from "@/lib/orders";
import { claimIntegrationJob } from "@/lib/integration-jobs";
import { openSecret } from "@/lib/secret-box";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

/**
 * Agent 4: signed inbound webhook for marketplace connectors.
 * Auth = HMAC-SHA256 over the raw body with the provider's webhookSecret,
 * sent as `X-Signature: <hex>`. No session — providers cannot log in.
 * Scoped per-org (optional ?orgId= or matched by HMAC across active providers
 * with that name). Idempotent per (orgId, provider, eventId).
 */
export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit("integration-webhook-ip", clientIp(req.headers), 120, 60_000);
    const providerName = req.nextUrl.searchParams.get("provider") ?? "";
    const orgIdParam = req.nextUrl.searchParams.get("orgId") ?? undefined;
    const raw = await req.text();
    const got = req.headers.get("x-signature") ?? "";
    if (!providerName || !got) fail(401, "VALIDATION", "Authentication failed");

    const candidates = await prisma.integrationProvider.findMany({
      where: {
        name: providerName,
        active: true,
        webhookSecret: { not: null },
        ...(orgIdParam ? { orgId: orgIdParam } : {}),
      },
    });
    const gotBuf = Buffer.from(got);
    const provider = candidates.find((p) => {
      if (!p.webhookSecret) return false;
      const expected = createHmac("sha256", openSecret(p.webhookSecret)).update(raw).digest("hex");
      const expBuf = Buffer.from(expected);
      return expBuf.length === gotBuf.length && timingSafeEqual(expBuf, gotBuf);
    });
    // One generic message before the signature verifies — distinct errors would
    // let unauthenticated callers enumerate configured provider slugs or orgIds.
    if (!provider) fail(401, "VALIDATION", "Authentication failed");

    let body: { eventId?: string; event?: string; data?: unknown };
    try {
      body = JSON.parse(raw) as { eventId?: string; event?: string; data?: unknown };
    } catch {
      fail(400, "VALIDATION", "Invalid JSON payload");
    }
    if (typeof body.eventId !== "string" || typeof body.event !== "string" || !body.data)
      fail(400, "VALIDATION", "eventId, event and data required");

    const data = body.data as CreateOrderInput;
    const externalId = body.event === "order.created"
      ? data.externalId?.trim()
      : body.eventId;
    if (!externalId) fail(400, "VALIDATION", "order.created requires data.externalId");
    const idempotencyKey = body.event === "order.created"
      ? `${provider.orgId}:${provider.name}:marketplace-order:${externalId}`
      : `${provider.orgId}:${provider.name}:webhook:${body.eventId}`;
    const { job, claimed } = await claimIntegrationJob({
      orgId: provider.orgId,
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
