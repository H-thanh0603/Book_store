// Public product recommendations for the storefront ("mua cùng").
// P4-6: anonymous-safe — recommendations are scoped to the source variant's
// org inside the lib, and only id/sku/name/reason cross the wire.
import { NextRequest } from "next/server";
import { apiError, fail, ok } from "@/lib/api";
import { agentRateLimit } from "@/lib/agent-auth";
import { getProductRecommendations } from "@/lib/recommendations";

export async function GET(req: NextRequest) {
  try {
    await agentRateLimit(req, "storefront_reco", "storefront-catalog", 60);
    const variantId = req.nextUrl.searchParams.get("variantId");
    if (!variantId) fail(400, "VALIDATION", "variantId required");
    const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take")) || 4, 1), 8);
    const recs = await getProductRecommendations(variantId, take);
    return ok({ recommendations: recs });
  } catch (err) {
    return apiError(err);
  }
}
