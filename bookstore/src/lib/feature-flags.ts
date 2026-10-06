// Per-org runtime feature flags (pattern: twentyhq/twenty workspace flags).
// An explicit OrgFeatureFlag row overrides the org's plan default in BOTH
// directions — enable a plan-excluded feature for a pilot org, or kill-switch
// a feature without a deploy. No row defers to the plan
// (src/lib/plan-limits.ts). One indexed read per check, same cost class as
// loadPlan — add a cache only when that shows up in measurements.
import { prisma } from "./db";

/**
 * The explicit per-org override, or null when the plan decides.
 */
export async function orgFeatureOverride(
  orgId: string | null | undefined,
  feature: string
): Promise<boolean | null> {
  if (!orgId) return null;
  const row = await prisma.orgFeatureFlag.findUnique({
    where: { orgId_feature: { orgId, feature } },
    select: { enabled: true },
  });
  return row ? row.enabled : null;
}

/**
 * Admin toggle (upsert). Wired into org-settings paths as they need it;
 * flags take effect on the next check — checks read through, no cache.
 */
export async function setOrgFeature(orgId: string, feature: string, enabled: boolean): Promise<void> {
  await prisma.orgFeatureFlag.upsert({
    where: { orgId_feature: { orgId, feature } },
    create: { orgId, feature, enabled },
    update: { enabled },
  });
}
