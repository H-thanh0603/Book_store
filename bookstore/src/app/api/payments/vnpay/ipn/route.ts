import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { settleVnpayResponse } from "@/lib/vnpay";
import { emit } from "@/lib/webhook-bus";
import { settleBillingPayment } from "@/lib/billing";
import { prisma } from "@/lib/db";

/**
 * VNPay IPN (server-to-server callback). Response shape is owned by the VNPay
 * contract — plain JSON {RspCode, Message}, never ok()/apiError internals.
 */
export async function GET(req: NextRequest) {
  try {
    await enforceRateLimit("vnpay-ipn", clientIp(req.headers), 60, 60_000);
    const result = await settleVnpayResponse(req.nextUrl.searchParams);
    const txnRef = req.nextUrl.searchParams.get("vnp_TxnRef") ?? "";
    const completed = result.settled === "PAID";

    if (completed && txnRef.startsWith("bill_")) {
      settleBillingPayment(txnRef).catch((err) =>
        console.error(JSON.stringify({ level: "error", event: "billing_settle_failed", txnRef, message: err?.message }))
      );
    }

    // Only emit webhook events when the IPN signature & amount verified cleanly
    // (result.ok === true) and the payment actually transitioned to PAID or FAILED.
    // Forged/invalid-signature callbacks MUST NOT emit spoofed payment.failed events.
    if (result.ok && (result.settled === "PAID" || result.settled === "FAILED")) {
      const org = await prisma.webPayment.findUnique({
        where: { txnRef },
        select: {
          order: { select: { store: { select: { region: { select: { orgId: true } } } } } },
          billingInvoice: { select: { orgId: true } },
        },
      }).catch(() => null);
      const emitOrgId = org?.order?.store?.region?.orgId ?? org?.billingInvoice?.orgId ?? null;
      if (emitOrgId) {
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
          console.error(JSON.stringify({ level: "error", event: "webhook_emit_failed", message: String(err) }))
        );
      }
    }

    return NextResponse.json(
      { RspCode: result.rspCode, Message: result.message },
      { status: result.ok ? 200 : 400 },
    );
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      return NextResponse.json({ RspCode: "99", Message: "Too many requests" }, { status: 429 });
    }
    return NextResponse.json({ RspCode: "99", Message: "Internal error" }, { status: 500 });
  }
}
