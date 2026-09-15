// Listing-health issues for catalog staged fixes — staff only.
// Read-only: the UI applies fixes via PATCH /api/products (audited).

import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { getListingIssues } from "@/lib/merchant-agent";

export async function GET() {
  try {
    const auth = await requirePermission("product.update");
    // Tenant isolation: listing issues never cross orgs.
    const issues = await getListingIssues({ orgId: auth.orgId }, 100);
    return ok({ issues });
  } catch (err) {
    return apiError(err);
  }
}
