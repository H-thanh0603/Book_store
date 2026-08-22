import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { getProductRecommendations } from "@/lib/recommendations";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("product.view");
    const variantId = req.nextUrl.searchParams.get("variantId");
    if (!variantId) fail(400, "VALIDATION", "variantId required");
    return ok({ recommendations: await getProductRecommendations(variantId) });
  } catch (err) {
    return apiError(err);
  }
}
