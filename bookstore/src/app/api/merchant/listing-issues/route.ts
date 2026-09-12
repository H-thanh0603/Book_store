// Listing-health issues for catalog staged fixes — staff only.
// Read-only: the UI applies fixes via PATCH /api/products (audited).

import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { getListingIssues } from "@/lib/merchant-agent";

export async function GET() {
  try {
    await requirePermission("product.update");
    return ok({ issues: await getListingIssues(100) });
  } catch (err) {
    return apiError(err);
  }
}
