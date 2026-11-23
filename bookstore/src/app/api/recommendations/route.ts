import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { requireOrgId } from "@/lib/org-scope";
import { apiError, fail, ok } from "@/lib/api";
import { getProductRecommendations } from "@/lib/recommendations";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("product.view");
    const orgId = requireOrgId(auth);
    const variantId = req.nextUrl.searchParams.get("variantId");
    if (!variantId) fail(400, "VALIDATION", "variantId required");
    const owned = await prisma.productVariant.findFirst({
      where: { id: variantId, orgId },
      select: { id: true },
    });
    if (!owned) fail(404, "NOT_FOUND", "Variant not found");
    return ok({ recommendations: await getProductRecommendations(variantId) });
  } catch (err) {
    return apiError(err);
  }
}
