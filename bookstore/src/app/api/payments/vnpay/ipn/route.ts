import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { settleVnpayResponse } from "@/lib/vnpay";
import { emit } from "@/lib/webhook-bus";
import { settleBillingPayment } from "@/lib/billing";
import { prisma } from "@/lib/db";

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
  const txnRef = req.nextUrl.searchParams.get("vnp_TxnRef") ?? "";
  // settled reflects the WebPayment row: PAID only when money actually landed
  // (gateway success AND — for order payments — the CONFIRMED → PAID claim won).
  // A REFUND_REQUIRED capture (order already cancelled) is acked "00" to the
  // gateway but never reported as completed, and never bills a subscription.
  const completed = result.settled === "PAID";
  // Billing-cycle WebPayments share the same VNPay gateway but have no
  // Order. Only a real PAID capture may flip the linked BillingInvoice —
  // a failed gateway response must leave it PENDING (audit MONEY-002).
  if (completed && txnRef.startsWith("bill_")) {
    settleBillingPayment(txnRef).catch((err) =>
      console.error(JSON.stringify({ level: "error", event: "billing_settle_failed", txnRef, message: err?.message }))
    );
  }
  // PAY-003 (audit 2026-08-30): emit to the owning org, not a hardcoded
  // "default" — order payments scope via Order→Store→Region, billing-cycle
  // payments via their BillingInvoice.orgId. Falls back to the first org for
  // unknown refs so the event still lands somewhere auditable.
  const org = await prisma.webPayment.findUnique({
    where: { txnRef },
    select: {
      order: { select: { store: { select: { region: { select: { orgId: true } } } } } },
      billingInvoice: { select: { orgId: true } },
    },
  }).catch(() => null);
  const emitOrgId =
    org?.order?.store?.region?.orgId ?? org?.billingInvoice?.orgId
    ?? (await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id
    ?? "default";
  // Fire-and-forget: the VNPay contract is owned by the response below.
  // emit() is itself idempotent on eventId, so a VNPay retry is safe.
  emit({
    eventId: `vnpay:${completed ? "completed" : "failed"}:${txnRef}`,
    eventType: completed ? "payment.completed" : "payment.failed",
    orgId: emitOrgId,
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
