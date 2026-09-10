// Refund queue — the operator path for REFUND_REQUIRED captures (audit
// MONEY-001 follow-up).
//
// When a gateway capture races an order cancellation, settleVnpayResponse
// records the money as REFUND_REQUIRED instead of PAID. Before this module
// those rows were a dead end: money taken, order cancelled, no queue, no
// UI, no alert — the only trace was one error log line at capture time.
//
// This job closes that loop:
//   1. scan REFUND_REQUIRED rows whose refundStatus is not yet PENDING
//      (covers rows created before the backfill, and any code path that
//      forgets to stamp refundStatus at settle time)
//   2. stamp refundStatus = PENDING so they enter the queue exactly once
//   3. emit a `payment.refund_required` webhook to the owning org so
//      integrations hear about it immediately
//
// Refunding itself stays a human action (VNPay sandbox has no refund API;
// production refunds go through the merchant portal or a bank transfer).
// The admin marks the row REFUNDED via /api/payments/refunds — see
// payments-refunds route — and the audit trail records who and when.

import { prisma } from "./db";
import { emit } from "./webhook-bus";

export type RefundScanResult = {
  queued: number; // rows newly stamped PENDING this pass
  pending: number; // total rows currently awaiting a refund
};

export async function scanRefundRequired(): Promise<RefundScanResult> {
  // 1. Stamp any REFUND_REQUIRED row missing its queue marker. updateMany
  //    is the claim: a concurrent scheduler instance can never double-queue.
  const stamped = await prisma.webPayment.updateMany({
    where: { status: "REFUND_REQUIRED", refundStatus: null },
    data: { refundStatus: "PENDING" },
  });

  // 2. Load the open queue once for the count + webhook fan-out. Include the
  //    order's org via Store → Region so each org only hears about its own
  //    money; billing-cycle payments (no orderId) can't reach this state.
  const open = await prisma.webPayment.findMany({
    where: { status: "REFUND_REQUIRED", refundStatus: "PENDING" },
    select: {
      id: true,
      txnRef: true,
      amount: true,
      paidAt: true,
      order: { select: { id: true, number: true, store: { select: { region: { select: { orgId: true } } } } } },
    },
    take: 200,
  });

  // 3. One webhook per org summarising its open refunds (not per row — a
  //    flash-sale expiry batch could otherwise fan out hundreds of events).
  if (stamped.count > 0) {
    const byOrg = new Map<string, { count: number; total: bigint; txnRefs: string[] }>();
    for (const row of open) {
      const orgId = row.order?.store?.region?.orgId;
      if (!orgId) continue; // orphaned row — surfaced by the admin list + alert, not a webhook
      const cur = byOrg.get(orgId) ?? { count: 0, total: 0n, txnRefs: [] };
      cur.count += 1;
      cur.total += row.amount;
      cur.txnRefs.push(row.txnRef);
      byOrg.set(orgId, cur);
    }
    for (const [orgId, summary] of byOrg) {
      await emit({
        eventType: "payment.refund_required",
        orgId,
        payload: {
          count: summary.count,
          totalVnd: Number(summary.total),
          txnRefs: summary.txnRefs.slice(0, 50),
          message: "Khách đã thanh toán nhưng đơn đã bị hủy — cần hoàn tiền qua cổng/bank. Xem /settings/payments.",
        },
      }).catch((err) =>
        console.error(JSON.stringify({ level: "error", event: "refund_webhook_failed", orgId, message: String(err) }))
      );
    }
  }

  return { queued: stamped.count, pending: open.length };
}
