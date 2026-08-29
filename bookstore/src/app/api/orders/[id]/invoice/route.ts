import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";
import { enqueueEinvoiceForOrder, enqueueEinvoiceForPosTransaction } from "@/lib/einvoice";

/**
 * POST /api/orders/[id]/invoice — force-enqueue an e-invoice for an existing
 * order. Idempotent: re-issuing the same orderId returns the existing row.
 * The orderId prefix "POS:" routes to PosTransaction; everything else to Order.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("invoices.issue");
    const { id } = await ctx.params;
    const row = id.startsWith("POS:")
      ? await enqueueEinvoiceForPosTransaction(id.slice(4))
      : await enqueueEinvoiceForOrder(id);
    if (!row) fail(404, "NOT_FOUND", "Order not found");
    return ok(row, 201);
  } catch (e) { return apiError(e); }
}
