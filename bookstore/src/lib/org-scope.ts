// Per-request org-scope helpers. The codebase is multi-tenant but the
// orgId column is only present on resources that have a direct org
// association (e.g. WebhookEndpoint.orgId, EInvoice.orgId). Models that
// are scoped through Store -> Region -> Organization need the join
// because Prisma can't infer a cross-relation filter.
//
// Use withOrg() when the query targets a model with a direct orgId
// column. Use withOrgViaStore() when the resource is linked to a Store
// (orders, inventory, etc.) -- the join goes through Region.
//
// The audit in PR B2 found N call sites missing this. After this lands
// every new query should pick one of these two helpers. ponytail: store-
// scoped queries still need a separate requirePermission(..., storeId)
// check; the helpers only enforce the org boundary.

import type { Prisma } from "../generated/prisma/client";
import type { AuthContext } from "./auth";
import { prisma } from "./db";

type OrgFilter = { orgId: string };

/**
 * Inject `where.orgId = auth.orgId` for models with a direct orgId column.
 * FAIL-CLOSED (audit Q35): a caller without an org gets 403, never an
 * unscoped filter. Admin scripts and tests run outside HTTP routes with
 * direct prisma access, so no in-request bypass is needed.
 */
export function withOrg<T extends Record<string, unknown> | undefined>(
  auth: AuthContext,
  where: T = undefined as T
): T & OrgFilter {
  if (!auth.orgId)
    throw Object.assign(new Error("Forbidden: caller has no organization"), { status: 403 });
  return { ...(where ?? {}), orgId: auth.orgId } as T & OrgFilter;
}

/**
 * For models without a direct orgId (e.g. Order, InventoryBalance) the
 * org boundary is enforced by joining through Store -> Region.orgId.
 * Returns the where fragment to spread into a prisma.findMany / count.
 */
export function withOrgViaStore(auth: AuthContext): Prisma.OrderWhereInput | Prisma.InventoryBalanceWhereInput {
  if (!auth.orgId)
    throw Object.assign(new Error("Forbidden: caller has no organization"), { status: 403 });
  return { store: { region: { orgId: auth.orgId } } };
}

/**
 * Verify an explicit orgId from a request body or URL param matches the
 * caller's org. Catches the "client passes orgId=other-org in the body"
 * attack before any prisma call.
 */
/**
 * Require the caller's org, fail-closed (audit Q35). Replaces every
 * `auth.orgId ?? (await defaultOrgId())` call site: an org-less session is
 * mis-provisioned and gets 403, never the seeded demo org's data.
 */
export function requireOrgId(auth: AuthContext): string {
  if (!auth.orgId)
    throw Object.assign(new Error("Forbidden: caller has no organization"), { status: 403 });
  return auth.orgId;
}

export function assertSameOrg(auth: AuthContext, claimedOrgId: string | null | undefined) {
  if (!auth.orgId)
    throw Object.assign(new Error("Forbidden: caller has no organization"), { status: 403 });
  if (claimedOrgId && claimedOrgId !== auth.orgId) {
    throw Object.assign(new Error("Forbidden: org mismatch"), { status: 403 });
  }
}

// AUDIT (B2, follow-up):
//   45 API routes call requirePermission() today. Migration of each to
//   withOrg() / withOrgViaStore() is intentionally NOT in this commit —
//   the existing store-scope check on Order/Inventory paths already
//   blocks cross-tenant writes via requirePermission(..., storeId). The
//   audit verifies that empirically: scripts/tests/test-tenant-isolation.ts.
//   When B2 follow-ups land they should add withOrg to /api/invoices,
//   /api/webhooks, and the new org-scoped routes; Order-scoped routes
//   already use resolveStoreScope which is the right tool there.

/**
 * REMOVED (audit Q35): defaultOrgId() used to resolve org-less callers to
 * the seeded demo org — a silent cross-tenant targeting primitive once a
 * second org exists. Deleted; every caller now requires auth.orgId (403).
 * Admin scripts needing an org look it up explicitly by slug.
 */
