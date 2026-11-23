import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { settleMomoResponse } from "@/lib/momo";
import { emit } from "@/lib/webhook-bus";
import { prisma } from "@/lib/db";

/**
 * MoMo IPN (server-to-server callback). Accepts GET (query params) and POST
 * (JSON body). Answers HTTP 200 with {resultCode, message} on normal callbacks,
 * 429 on rate-limit, 500 on unexpected error.
 */
async function handle(req: NextRequest) {
  try {
    await enforceRateLimit("momo-ipn", clientIp(req.headers), 60, 60_000);
    let params: URLSearchParams;
    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      params = new URLSearchParams(
        Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]))
      );
    } else {
      params = req.nextUrl.searchParams;
    }
    const result = await settleMomoResponse(params);
    const txnRef = params.get("orderId") ?? "";
    const completed = result.settled === "PAID";

    // Only emit webhook events after signature + amount verification succeeded.
    if (result.ok && (result.settled === "PAID" || result.settled === "FAILED")) {
      const org = txnRef
        ? await prisma.webPayment.findUnique({
            where: { txnRef },
            select: { order: { select: { store: { select: { region: { select: { orgId: true } } } } } } },
          }).catch(() => null)
        : null;
      const emitOrgId = org?.order?.store?.region?.orgId ?? null;
      if (emitOrgId) {
        emit({
          eventId: `momo:${completed ? "completed" : "failed"}:${txnRef}`,
          eventType: completed ? "payment.completed" : "payment.failed",
          orgId: emitOrgId,
          payload: { provider: "momo", orderId: result.orderId ?? null, rspCode: result.rspCode, message: result.message },
        }).catch((err) =>
          console.error(JSON.stringify({ level: "error", event: "webhook_emit_failed", message: String(err) }))
        );
      }
    }
    return NextResponse.json({ resultCode: result.ok ? 0 : 1, message: result.message });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      return NextResponse.json({ resultCode: 1, message: "Too many requests" }, { status: 429 });
    }
    return NextResponse.json({ resultCode: 1, message: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
