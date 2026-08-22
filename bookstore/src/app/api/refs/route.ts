import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

// GET /api/refs?kind=suppliers|warehouses|locations|variants
// Small lookup endpoint for the management pages' dropdowns.
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const kind = req.nextUrl.searchParams.get("kind");
    if (kind === "suppliers")
      return ok({ suppliers: await prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) });
    if (kind === "warehouses")
      return ok({ warehouses: await prisma.warehouse.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) });
    if (kind === "locations")
      return ok({
        locations: await prisma.stockLocation.findMany({
          select: { id: true, name: true, type: true },
          where: { OR: [{ type: "STORE_STOCKROOM" }, { type: "WAREHOUSE" }] },
          orderBy: { name: "asc" },
        }),
      });
    if (kind === "variants")
      return ok({
        variants: await prisma.productVariant.findMany({
          select: { id: true, sku: true, product: { select: { name: true } } },
          take: 500,
          orderBy: { sku: "asc" },
        }),
      });
    return ok({});
  } catch (err) {
    return apiError(err);
  }
}
