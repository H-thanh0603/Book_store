import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { apiError, fail } from "@/lib/api";
import { quoteSale } from "@/lib/pos";

// POST /api/pos/quote { items, storeId, customerId?, couponCode?, redeemPoints? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await requirePermission("pos.sell", body.storeId);
    if (!Array.isArray(body.items) || body.items.length === 0)
      fail(400, "VALIDATION", "items required");
    for (const i of body.items)
      if (!i.variantId || !Number.isInteger(i.quantity) || i.quantity <= 0)
        fail(400, "VALIDATION", "each item needs variantId and positive integer quantity");
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
