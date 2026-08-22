import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

// Compact staff API for barcode scanners and installable mobile web clients.
export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("inventory.view");
    const scopedStoreIds = auth.roles.filter((role) => role.permissions.includes("inventory.view") && role.storeId).map((role) => role.storeId!);
    const hasGlobalScope = auth.roles.some((role) => role.permissions.includes("inventory.view") && role.storeId === null);
    const locationFilter = hasGlobalScope ? undefined : { storeId: { in: scopedStoreIds } };
    const barcode = req.nextUrl.searchParams.get("barcode")?.trim();
    if (barcode) {
      const item = await prisma.productBarcode.findUnique({
        where: { barcode },
        include: { variant: { include: {
          product: true,
          balances: { where: { location: locationFilter }, include: { location: true } },
        } } },
      });
      return ok({ item: item ? {
        barcode: item.barcode, sku: item.variant.sku, product: item.variant.product.name,
        stock: item.variant.balances.map((balance) => ({
          locationId: balance.locationId, location: balance.location.name,
          onHand: balance.onHand, reserved: balance.reserved, available: balance.onHand - balance.reserved,
        })),
      } : null });
    }

    const [tasks, lowStock] = await Promise.all([
      prisma.warehouseTask.findMany({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] }, location: locationFilter },
        include: { location: true }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 30,
      }),
      prisma.inventoryBalance.findMany({
        where: { location: locationFilter }, include: { variant: { include: { product: true } }, location: true }, take: 200,
      }),
    ]);
    return ok({
      tasks,
      lowStock: lowStock.filter((balance) => balance.onHand - balance.reserved <= 5).slice(0, 30).map((balance) => ({
        sku: balance.variant.sku, product: balance.variant.product.name, location: balance.location.name,
        available: balance.onHand - balance.reserved,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
