// Refund queue API — the operator surface for REFUND_REQUIRED captures
// (audit MONEY-001 follow-up; see src/lib/payment-refunds.ts for context).
//
//   GET  /api/payments/refunds        → open refund queue for the caller's org
//   PATCH /api/payments/refunds {id}  → mark a refund completed (human does
//                                       the actual refund via bank/portal)
//
// Org boundary: order payments scope via Order → Store → Region → orgId
// (withOrgViaStore). Legacy superuser (no orgId) sees the whole queue.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, reqStr } from "@/lib/api";
import { withOrgViaStore } from "@/lib/org-scope";
import { audit } from "@/lib/auth";

export async function GET() {
  try {
    const auth = await requirePermission("settings.read", undefined, { allowSuspended: true });
    const rows = await prisma.webPayment.findMany({
      where: {
        status: "REFUND_REQUIRED",
        order: withOrgViaStore(auth) as Record<string, never>, // org boundary; billing-cycle rows have no order and can't reach REFUND_REQUIRED
      },
      orderBy: { paidAt: "asc" },
      take: 100,
      select: {
        id: true,
        txnRef: true,
        provider: true,
        amount: true,
        paidAt: true,
        refundStatus: true,
        refundedAt: true,
        refundNote: true,
        createdAt: true,
        order: { select: { id: true, number: true, status: true, total: true, customer: { select: { name: true, phone: true } } } },
      },
    });
    return ok({
      refunds: rows.map((r) => ({
        id: r.id,
        txnRef: r.txnRef,
        provider: r.provider,
        amount: Number(r.amount),
        paidAt: r.paidAt,
        createdAt: r.createdAt,
        refundStatus: r.refundStatus,
        refundedAt: r.refundedAt,
        refundNote: r.refundNote,
        orderNumber: r.order?.number ?? null,
        orderStatus: r.order?.status ?? null,
        orderTotal: r.order ? Number(r.order.total) : null,
        customerName: r.order?.customer?.name ?? null,
        customerPhone: r.order?.customer?.phone ?? null,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}

// PATCH { id, note? } — operator confirms the money is back with the buyer.
// The claim (refundStatus = PENDING) makes double-marking a no-op and keeps
// a second operator from racing the first.
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.write", undefined, { allowSuspended: true });
    const b = await req.json();
    const id = reqStr(b.id, "id");
    const note = b.note === undefined || b.note === null || b.note === "" ? null : reqStr(b.note, "note", 500);

    const wp = await prisma.webPayment.findUnique({
      where: { id },
      select: { id: true, txnRef: true, status: true, refundStatus: true, amount: true, order: { select: { store: { select: { region: { select: { orgId: true } } } } } } },
    });
    if (!wp) fail(404, "NOT_FOUND", "Payment not found");
    if (wp.status !== "REFUND_REQUIRED") fail(400, "VALIDATION", "Payment is not in REFUND_REQUIRED state");
    // Org boundary: the order's org must match the caller (legacy superuser bypasses).
    const ownerOrg = wp.order?.store?.region?.orgId;
    if (auth.orgId && ownerOrg && ownerOrg !== auth.orgId)
      fail(403, "FORBIDDEN", "Payment belongs to another organization");

    const claimed = await prisma.webPayment.updateMany({
      where: { id: wp.id, refundStatus: "PENDING" },
      data: { refundStatus: "REFUNDED", refundedAt: new Date(), refundedBy: auth.userId, refundNote: note },
    });
    if (claimed.count === 0) fail(409, "DUPLICATE", "Refund already marked as completed");

    await audit(auth.userId, "payment.refund_marked", "WebPayment", wp.id, {
      txnRef: wp.txnRef,
      amountVnd: Number(wp.amount),
      note: note ?? undefined,
    });
    return ok({ id: wp.id, refundStatus: "REFUNDED" });
  } catch (err) {
    return apiError(err);
  }
}
