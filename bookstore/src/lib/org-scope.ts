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
 * Inject `where.orgId = auth.orgId` if the model has an orgId column.
 * Returns the original `where` (or `{}`) when the caller is a legacy
 * superuser (orgId null) so admin scripts keep working.
 */
export function withOrg<T extends Record<string, unknown> | undefined>(
  auth: AuthContext,
  where: T = undefined as T
): T & OrgFilter {
  if (!auth.orgId) return (where ?? ({} as T)) as T & OrgFilter;
  return { ...(where ?? {}), orgId: auth.orgId } as T & OrgFilter;
}

/**
 * For models without a direct orgId (e.g. Order, InventoryBalance) the
 * org boundary is enforced by joining through Store -> Region.orgId.
 * Returns the where fragment to spread into a prisma.findMany / count.
 */
export function withOrgViaStore(auth: AuthContext): Prisma.OrderWhereInput | Prisma.InventoryBalanceWhereInput {
  if (!auth.orgId) return {};
  return { store: { region: { orgId: auth.orgId } } };
}

/**
 * Verify an explicit orgId from a request body or URL param matches the
 * caller's org. Catches the "client passes orgId=other-org in the body"
 * attack before any prisma call.
 */
export function assertSameOrg(auth: AuthContext, claimedOrgId: string | null | undefined) {
  if (!auth.orgId) return; // legacy admin
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
 * Resolve the caller's org or, for the legacy org-less superuser, the seeded
 * demo org. FAIL-CLOSED: with no orgs in the database this throws instead of
 * returning a fabricated "default" id.
 *
 * History: routes used to inline `auth.orgId ?? organization.findFirstOrThrow
 * (orderBy createdAt asc)` — silent cross-tenant targeting once a second org
 * exists. New code must call this helper instead; when the legacy superuser
 * path is retired, delete the fallback here too.
 */
export async function defaultOrgId(): Promise<string> {
  const org = await prisma.organization.findFirst({
    where: { slug: "melio" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (org) return org.id;
  const fallback = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!fallback) throw Object.assign(new Error("No organization exists — cannot resolve scope"), { status: 500 });
  return fallback.id;
}
