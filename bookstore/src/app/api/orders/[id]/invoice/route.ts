import { NextRequest } from "next/server";
import { prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";
import { enqueueEinvoiceForOrder, enqueueEinvoiceForPosTransaction } from "@/lib/einvoice";

/**
 * POST /api/orders/[id]/invoice — force-enqueue an e-invoice for an existing
 * order. Idempotent: re-issuing the same orderId returns the existing row.
 * The orderId prefix "POS:" routes to PosTransaction; everything else to Order.
 *
 * P0-7: the enqueue used to run on any id — a caller could burn T-VAN
 * budget and expose foreign fiscal data. Ownership is verified first.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("invoices.issue");
    const { id } = await ctx.params;
    if (id.startsWith("POS:")) {
      const txnId = id.slice(4);
      // PosTransaction carries storeId only (no store relation) — resolve
      // the store separately for the org check.
      const txn = await prismaRead.posTransaction.findUnique({ where: { id: txnId } });
      if (!txn) fail(404, "NOT_FOUND", "Order not found");
      if (auth.orgId) {
        const store = await prismaRead.store.findUnique({
          where: { id: txn.storeId },
          select: { orgId: true },
        });
        if (!store || store.orgId !== auth.orgId)
          fail(404, "NOT_FOUND", "Order not found");
      }
      const row = await enqueueEinvoiceForPosTransaction(txnId);
      if (!row) fail(404, "NOT_FOUND", "Order not found");
      return ok(row, 201);
    }
    const order = await prismaRead.order.findUnique({
      where: { id },
      include: {
        store: { select: { orgId: true } },
        customer: { select: { orgId: true } },
      },
    });
    if (!order) fail(404, "NOT_FOUND", "Order not found");
    if (auth.orgId) {
      const orgs = [order.store?.orgId ?? null, order.customer?.orgId ?? null].filter(Boolean);
      if (orgs.length > 0 && orgs.some((o) => o !== auth.orgId))
        fail(404, "NOT_FOUND", "Order not found");
    }
    const row = await enqueueEinvoiceForOrder(id);
    if (!row) fail(404, "NOT_FOUND", "Order not found");
    return ok(row, 201);
  } catch (e) { return apiError(e); }
}
