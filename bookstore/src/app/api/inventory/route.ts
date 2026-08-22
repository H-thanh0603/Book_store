import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

// GET /api/inventory?variantId=&storeId=
export async function GET(req: NextRequest) {
  try {
    await requirePermission("inventory.view");
    const sp = req.nextUrl.searchParams;
    const variantId = sp.get("variantId") ?? undefined;
    const storeId = sp.get("storeId") ?? undefined;

    const balances = await prisma.inventoryBalance.findMany({
      where: {
        variantId,
        location: storeId ? { storeId } : undefined,
      },
      include: { location: true, variant: { include: { product: true } } },
      take: 500,
    });
    return ok({
      balances: balances.map((b) => ({
        sku: b.variant.sku, product: b.variant.product.name,
        location: b.location.name, onHand: b.onHand, reserved: b.reserved,
        available: b.onHand - b.reserved, inTransit: b.inTransit, damaged: b.damaged,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
