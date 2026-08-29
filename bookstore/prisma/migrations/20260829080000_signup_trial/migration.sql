-- Self-serve signup: trial org, plans, subscriptions, user.orgId.
-- Backfills existing rows so the migration is safe to run on a populated
-- DB. New columns are NULL/DEFAULT-friendly; existing data keeps working
-- with orgId NULL (legacy user).

-- 1. OrgStatus enum
CREATE TYPE "OrgStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- 2. Plan + Subscription tables
CREATE TABLE "Plan" (
  "id"                TEXT NOT NULL,
  "code"              TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "monthlyPriceCents" INTEGER NOT NULL,
  "maxStores"         INTEGER NOT NULL,
  "maxUsers"          INTEGER NOT NULL,
  "features"          JSONB NOT NULL,
  "active"            BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

CREATE TABLE "Subscription" (
  "id"                 TEXT NOT NULL,
  "orgId"              TEXT NOT NULL,
  "planId"             TEXT NOT NULL,
  "status"             "OrgStatus" NOT NULL DEFAULT 'TRIAL',
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd"   TIMESTAMP(3) NOT NULL,
  "cancelAtPeriodEnd"  BOOLEAN NOT NULL DEFAULT false,
  "cancelledAt"        TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subscription_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id")
);
CREATE UNIQUE INDEX "Subscription_orgId_key" ON "Subscription"("orgId");

-- 3. Extend Organization with slug + status + trial
ALTER TABLE "Organization"
  ADD COLUMN "slug"       TEXT,
  ADD COLUMN "status"     "OrgStatus" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill slug from id for existing rows; app code always re-issues a
-- proper slug on signup. The unique index requires a non-null value, so
-- we materialise 'org-' || id as a deterministic placeholder.
UPDATE "Organization" SET "slug" = 'org-' || "id" WHERE "slug" IS NULL;
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- 4. Extend User with orgId
ALTER TABLE "User" ADD COLUMN "orgId" TEXT;
CREATE INDEX "User_orgId_idx" ON "User"("orgId");
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL;
