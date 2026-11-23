-- Multi-tenant isolation: add orgId to IntegrationProvider, IntegrationJob, LossAlert.

-- 1. IntegrationProvider
ALTER TABLE "IntegrationProvider" ADD COLUMN "orgId" TEXT;
UPDATE "IntegrationProvider"
SET "orgId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "orgId" IS NULL;
ALTER TABLE "IntegrationProvider" ALTER COLUMN "orgId" SET NOT NULL;
DROP INDEX IF EXISTS "IntegrationProvider_name_key";
CREATE UNIQUE INDEX "IntegrationProvider_orgId_name_key" ON "IntegrationProvider"("orgId", "name");
CREATE INDEX "IntegrationProvider_orgId_idx" ON "IntegrationProvider"("orgId");
ALTER TABLE "IntegrationProvider"
  ADD CONSTRAINT "IntegrationProvider_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. IntegrationJob
ALTER TABLE "IntegrationJob" ADD COLUMN "orgId" TEXT;
UPDATE "IntegrationJob"
SET "orgId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "orgId" IS NULL;
ALTER TABLE "IntegrationJob" ALTER COLUMN "orgId" SET NOT NULL;
DROP INDEX IF EXISTS "IntegrationJob_provider_status_idx";
CREATE INDEX "IntegrationJob_orgId_provider_status_idx" ON "IntegrationJob"("orgId", "provider", "status");
ALTER TABLE "IntegrationJob"
  ADD CONSTRAINT "IntegrationJob_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. LossAlert
ALTER TABLE "LossAlert" ADD COLUMN "orgId" TEXT;
UPDATE "LossAlert"
SET "orgId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "orgId" IS NULL;
ALTER TABLE "LossAlert" ALTER COLUMN "orgId" SET NOT NULL;
DROP INDEX IF EXISTS "LossAlert_rule_entityType_entityId_key";
DROP INDEX IF EXISTS "LossAlert_status_severity_idx";
CREATE UNIQUE INDEX "LossAlert_orgId_rule_entityType_entityId_key" ON "LossAlert"("orgId", "rule", "entityType", "entityId");
CREATE INDEX "LossAlert_orgId_status_severity_idx" ON "LossAlert"("orgId", "status", "severity");
ALTER TABLE "LossAlert"
  ADD CONSTRAINT "LossAlert_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
