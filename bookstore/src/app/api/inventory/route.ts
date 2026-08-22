import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, resolveStoreScope } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

// GET /api/inventory?variantId=&storeId= — store-scoped (deliverable 1)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const auth = await requirePermission("inventory.view");
    const scope = resolveStoreScope(auth, sp.get("storeId") ?? undefined, "inventory.view");

    const balances = await prisma.inventoryBalance.findMany({
      where: {
        variantId: sp.get("variantId") ?? undefined,
        location: scope ? { storeId: { in: scope } } : undefined,
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
