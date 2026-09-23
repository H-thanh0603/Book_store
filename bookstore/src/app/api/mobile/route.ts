import { NextRequest } from "next/server";
import { prisma, prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { Prisma } from "@/generated/prisma/client";

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

    // Agent 4: wave filter for the mobile picker view.
    const waveId = req.nextUrl.searchParams.get("waveId") ?? undefined;
    // Low-stock in SQL, not JS: load-200-then-filter/slice in memory grows
    // with the ledger. Same shape as the writer, ordered by scarcity.
    const storeFilter = hasGlobalScope ? Prisma.empty : Prisma.sql`AND l."storeId" IN (${Prisma.join(scopedStoreIds)})`;
    const orgFilter = auth.orgId ? Prisma.sql`AND v."orgId" = ${auth.orgId}` : Prisma.empty;
    const [tasks, lowStock] = await Promise.all([
      prisma.warehouseTask.findMany({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS"] }, location: locationFilter,
          ...(waveId ? { waveId } : {}),
          // Task → location → store; org through the location's store or
          // the first task item's variant org (warehouse locations are org-wide).
          ...(auth.orgId ? {
            OR: [
              { location: { store: { region: { orgId: auth.orgId } } } },
              { items: { some: { variant: { orgId: auth.orgId } } } },
            ],
          } : {}),
        },
        include: { location: true, items: { include: { variant: { select: { sku: true } } } } },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 30,
      }),
      prismaRead.$queryRaw<{
        sku: string; product: string; location: string; available: number;
      }[]>`
        SELECT v.sku, pr.name AS product, l.name AS location,
               (b."onHand" - b.reserved)::int AS available
        FROM "InventoryBalance" b
        JOIN "ProductVariant" v ON v.id = b."variantId"
        JOIN "Product" pr ON pr.id = v."productId"
        JOIN "StockLocation" l ON l.id = b."locationId"
        WHERE l.active AND v.active
          AND (b."onHand" - b.reserved) <= 5
          ${storeFilter} ${orgFilter}
        ORDER BY (b."onHand" - b.reserved) ASC
        LIMIT 30`,
    ]);
    return ok({ tasks, lowStock });
  } catch (err) {
    return apiError(err);
  }
}
