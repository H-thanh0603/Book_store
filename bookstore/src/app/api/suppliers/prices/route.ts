// Agent 2: supplier-product price history lookup.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";

// GET /api/suppliers/prices?supplierId=&variantId=
export async function GET(req: NextRequest) {
  try {
    await requirePermission("purchase.create");
    const sp = req.nextUrl.searchParams;
    const supplierId = sp.get("supplierId");
    const variantId = sp.get("variantId");
    if (!supplierId && !variantId) fail(400, "VALIDATION", "supplierId or variantId required");
    const prices = await prisma.supplierProductPrice.findMany({
      where: { supplierId: supplierId ?? undefined, variantId: variantId ?? undefined },
      include: { variant: { select: { sku: true } }, supplier: { select: { code: true, name: true } } },
      orderBy: { recordedAt: "desc" },
      take: 100,
    });
    return ok({ prices });
  } catch (err) {
    return apiError(err);
  }
}
