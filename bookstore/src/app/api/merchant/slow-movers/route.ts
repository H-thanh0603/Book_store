// Slow-mover candidates for AI promo drafts — staff only.
// Read-only: the UI creates drafts via POST /api/promotions {active:false}.
// Org-scoped (audit: cross-tenant leak): results are filtered to the
// caller's org (or the seeded demo org for the legacy superuser).
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { getSlowMovers } from "@/lib/merchant-agent";
import { defaultOrgId } from "@/lib/org-scope";

export async function GET() {
  try {
    const auth = await requirePermission("promotion.manage");
    const orgId = auth.orgId ?? (await defaultOrgId());
    return ok({ candidates: await getSlowMovers({ orgId }, 15) });
  } catch (err) {
    return apiError(err);
  }
}
