import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { settleMomoResponse } from "@/lib/momo";
import { emit } from "@/lib/webhook-bus";
import { prisma } from "@/lib/db";
import { defaultOrgId } from "@/lib/org-scope";

/**
 * MoMo IPN (server-to-server callback). Accepts GET (query params) and POST
 * (JSON body) — both funnel into the same verified settle handler, so a
 * gateway retry in either shape is a duplicate-safe no-op.
 *
 * Always answers HTTP 200 (MoMo retries non-2xx): the body carries resultCode
 * 0 on success. Fans out to the webhook bus like the VNPay IPN route.
 */
async function handle(req: NextRequest) {
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
  const org = txnRef
    ? await prisma.webPayment.findUnique({
        where: { txnRef },
        select: { order: { select: { store: { select: { region: { select: { orgId: true } } } } } } },
      }).catch(() => null)
    : null;
  const emitOrgId = org?.order?.store?.region?.orgId ?? (await defaultOrgId());
  emit({
    eventId: `momo:${completed ? "completed" : "failed"}:${txnRef}`,
    eventType: completed ? "payment.completed" : "payment.failed",
    orgId: emitOrgId,
    payload: { provider: "momo", orderId: result.orderId ?? null, rspCode: result.rspCode, message: result.message },
  }).catch((err) =>
    console.error(JSON.stringify({ level: "error", event: "webhook_emit_failed", message: String(err) }))
  );
  return NextResponse.json({ resultCode: result.ok ? 0 : 1, message: result.message });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
