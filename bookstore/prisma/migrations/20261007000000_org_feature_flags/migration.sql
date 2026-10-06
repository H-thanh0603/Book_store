-- Runtime, per-org feature toggles (pattern: twentyhq/twenty workspace flags):
-- an explicit row overrides the org's plan features JSON in BOTH directions —
-- enable a plan-excluded feature for a pilot org, or kill-switch a feature
-- without a deploy. No row → the plan decides (src/lib/feature-flags.ts).
CREATE TABLE "OrgFeatureFlag" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- The unique pair doubles as the lookup index: every runtime check reads by
-- (orgId, feature) and falls through to the plan when no row exists.
CREATE UNIQUE INDEX "OrgFeatureFlag_orgId_feature_key" ON "OrgFeatureFlag"("orgId", "feature");

ALTER TABLE "OrgFeatureFlag" ADD CONSTRAINT "OrgFeatureFlag_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
