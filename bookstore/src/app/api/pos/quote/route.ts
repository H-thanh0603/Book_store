import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { requireOrgId } from "@/lib/org-scope";
import { apiError, fail } from "@/lib/api";
import { quoteSale } from "@/lib/pos";

// POST /api/pos/quote { items, storeId, customerId?, couponCode?, redeemPoints? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.storeId) fail(400, "VALIDATION", "storeId required");
    const auth = await requirePermission("pos.sell", body.storeId);
    const orgId = requireOrgId(auth);
    if (body.customerId) {
      const cust = await prisma.customer.findFirst({ where: { id: body.customerId, orgId }, select: { id: true } });
      if (!cust) fail(404, "NOT_FOUND", "Customer not found");
    }
    if (!Array.isArray(body.items) || body.items.length === 0)
      fail(400, "VALIDATION", "items required");
    for (const i of body.items)
      if (!i.variantId || !Number.isInteger(i.quantity) || i.quantity <= 0)
        fail(400, "VALIDATION", "each item needs variantId and positive integer quantity");
    // Same rule as /api/pos sale: client prices only for pos.override_price holders.
    if (body.items.some((i: { unitPrice?: unknown }) => i.unitPrice != null)) {
      const canOverride = auth.roles.some(
        (r) => r.permissions.includes("pos.override_price") &&
          (r.storeId === null || body.storeId === undefined || r.storeId === body.storeId)
      );
      if (!canOverride)
        for (const i of body.items) delete i.unitPrice;
    }
    const quote = await quoteSale({
      storeId: body.storeId, customerId: body.customerId ?? null,
      couponCode: body.couponCode ?? null, redeemPoints: body.redeemPoints,
      items: body.items,
    });
    return Response.json(quote);
  } catch (err) {
    return apiError(err);
  }
}
