-- Per-org override of the four loss-prevention thresholds. Read by
-- loss-prevention.ts:scanLossPrevention() before falling back to
-- SystemConfig. Seeding is the app's job; this migration is schema only.
CREATE TABLE "LossPreventionRule" (
  "id"        TEXT PRIMARY KEY,
  "orgId"     TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "threshold" BIGINT NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL,
  UNIQUE ("orgId", "kind")
);
CREATE INDEX "LossPreventionRule_orgId_idx" ON "LossPreventionRule" ("orgId");
