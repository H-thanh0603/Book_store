// Slow-mover candidates for AI promo drafts — staff only.
// Read-only: the UI creates drafts via POST /api/promotions {active:false}.

import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { getSlowMovers } from "@/lib/merchant-agent";

export async function GET() {
  try {
    await requirePermission("promotion.manage");
    return ok({ candidates: await getSlowMovers(15) });
  } catch (err) {
    return apiError(err);
  }
}
