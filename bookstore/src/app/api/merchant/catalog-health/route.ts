// Catalog health for the Action Center + audit flows.
// Staff only (product.view). Wraps the unit-tested detectListingIssues
// detector: counts by kind + top rows. Draft fixes go through staged
// product.patch (human approval), never auto-applied.
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { getListingIssues } from "@/lib/merchant-agent";
import { requireOrgId } from "@/lib/org-scope";

export async function GET() {
  try {
    const auth = await requirePermission("product.view");
    const orgId = requireOrgId(auth);
    const issues = await getListingIssues({ orgId }, 100);
    const byKind: Record<string, number> = {};
    for (const i of issues) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
    return ok({ total: issues.length, byKind, issues: issues.slice(0, 50) });
  } catch (err) {
    return apiError(err);
  }
}
