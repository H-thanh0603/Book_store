import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { settleVnpayResponse } from "@/lib/vnpay";
import { enqueueEinvoiceForOrder } from "@/lib/einvoice";
import { emit } from "@/lib/webhook-bus";

/**
 * VNPay IPN (server-to-server callback). Response shape is owned by the VNPay
 * contract — plain JSON {RspCode, Message}, never ok()/apiError internals.
 *
 * Also fans the result out to the generic webhook bus so any subscribed
 * endpoint (MISA sync, owner mobile, etc.) sees payment.completed /
 * payment.failed without per-provider code. eventId is keyed by the VNPay
 * transaction ref so retries from the gateway dedupe naturally.
 */
export async function GET(req: NextRequest) {
  await enforceRateLimit("vnpay-ipn", clientIp(req.headers), 60, 60_000);
  const result = await settleVnpayResponse(req.nextUrl.searchParams);
  if (result.ok && result.orderId) {
    enqueueEinvoiceForOrder(result.orderId).catch((err) =>
      console.error(JSON.stringify({ level: "error", event: "einvoice_enqueue_failed", orderId: result.orderId, message: err?.message }))
    );
  }
  // Fire-and-forget: the VNPay contract is owned by the response below.
  // emit() is itself idempotent on eventId, so a VNPay retry is safe.
  const txnRef = req.nextUrl.searchParams.get("vnp_TxnRef") ?? "unknown";
  emit({
    eventId: `vnpay:${result.ok ? "completed" : "failed"}:${txnRef}`,
    eventType: result.ok ? "payment.completed" : "payment.failed",
    orgId: "default",
    payload: {
      provider: "vnpay",
      orderId: result.orderId ?? null,
      rspCode: result.rspCode,
      message: result.message,
    },
  }).catch((err) =>
    console.error(JSON.stringify({ level: "error", event: "webhook_emit_failed", message: err?.message }))
  );
  return NextResponse.json(
    { RspCode: result.rspCode, Message: result.message },
    { status: result.ok ? 200 : 400 },
  );
}
