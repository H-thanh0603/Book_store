import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

export async function GET() {
  try {
    await requirePermission("inventory.view");
    const balances = await prisma.inventoryBalance.findMany({
      include: { location: true, variant: { include: { product: true } } },
      take: 200,
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
