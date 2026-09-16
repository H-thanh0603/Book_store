import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api";
import { normalizeCarrierStatus, CARRIERS } from "@/lib/carriers";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

// POST /api/carriers/webhook — R1: carrier status pushes (GHTK / ViettelPost
// callback URL). Auth = shared secret (CARRIER_WEBHOOK_SECRET) — providers
// can't sign, so a weak per-provider check would be theater; one strong
// secret + HTTPS is the documented contract (see .env.example).
//
// Hardening (Batch A P0):
//   - timing-safe secret compare (plain !== leaks via timing oracle)
//   - rate limit (public endpoint, no session)
//   - replay/duplicate guard: same trackingNumber+status twice is a no-op
//     (providers retry on timeout; without this the second push rewrites
//     deliveredAt and emits a duplicate audit trail)
//   - secret via header OR body (body secret lands in logs/DB dumps; header
//     is preferred, body kept for legacy providers)
//
// Body: { provider: "GHTK"|"VTP", trackingNumber, status, ... }.
// Unknown statuses are ACKed (200) but ignored — providers retry exactly
// the pushes we fail, so never 4xx a parseable-but-unknown event.
export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit("carrier-webhook", clientIp(req.headers), 120, 60_000);
    const secret = process.env.CARRIER_WEBHOOK_SECRET;
    if (!secret)
      throw Object.assign(new Error("Carrier webhooks are not configured"), { status: 503, code: "UNAVAILABLE" });
    const body = (await req.json().catch(() => ({}))) as {
      secret?: string;
      provider?: string;
      trackingNumber?: string;
      status?: string | number;
    };
    const provided = req.headers.get("x-carrier-secret") ?? body.secret ?? "";
    const a = createHash("sha256").update(secret).digest();
    const b = createHash("sha256").update(String(provided)).digest();
    if (!provided || !timingSafeEqual(a, b))
      throw Object.assign(new Error("Forbidden"), { status: 403, code: "FORBIDDEN" });
    const provider = String(body.provider ?? "").toUpperCase();
    if (!(CARRIERS as readonly string[]).includes(provider) || provider === "MANUAL")
      throw Object.assign(new Error("Unknown provider"), { status: 400, code: "VALIDATION" });
    if (!body.trackingNumber)
      throw Object.assign(new Error("trackingNumber is required"), { status: 400, code: "VALIDATION" });
    const mapped = normalizeCarrierStatus(provider, body.status ?? "");
    if (!mapped) return NextResponse.json({ ok: true, ignored: true });
    const shipment = await prisma.shipment.findFirst({
      where: { trackingNumber: String(body.trackingNumber) },
      include: { order: { select: { id: true, number: true, status: true } } },
    });
    if (!shipment) return NextResponse.json({ ok: true, ignored: true });
    // Replay guard: providers retry pushes on timeout — same status twice
    // must not rewrite deliveredAt or duplicate the audit trail.
    if (shipment.status === mapped) return NextResponse.json({ ok: true, duplicate: true });
    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: mapped,
          ...(mapped === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        },
      });
      // Carrier DELIVERED settles the order (CONFIRMED→…→DELIVERED chain stays
      // intact: only advance forward, never resurrect CANCELLED/RETURNED).
      if (mapped === "DELIVERED" && ["SHIPPED", "READY"].includes(shipment.order.status)) {
        const claimed = await tx.order.updateMany({
          where: { id: shipment.order.id, status: shipment.order.status },
          data: { status: "DELIVERED" },
        });
        if (claimed.count === 1) {
          await tx.orderStatusHistory.create({
            data: {
              orderId: shipment.order.id,
              fromStatus: shipment.order.status,
              toStatus: "DELIVERED",
              userId: null,
            },
          });
        }
      }
    });
    return NextResponse.json({ ok: true, order: shipment.order.number, status: mapped });
  } catch (e) {
    return apiError(e);
  }
}
