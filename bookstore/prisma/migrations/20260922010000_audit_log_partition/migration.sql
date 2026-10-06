-- MED-9 (audit 2026-09-22): AuditLog grows unboundedly — every login,
-- every sale, every mutation writes a row, and the prune job only deletes
-- rows older than AUDIT_LOG_RETENTION_DAYS. On a busy org this becomes the
-- largest table after InventoryMovement; autovacuum and the
-- entity/entityId lookups degrade as it fills.
--
-- Same strategy as InventoryMovement (20260829100000): monthly RANGE
-- partition on createdAt, pre-created +13 months ahead, detached (not
-- dropped) after the retention window by the nightly partitions job.
--
-- Partition-key trade-off: the PK becomes (id, createdAt) — Postgres needs
-- the partition column in any UNIQUE/PK on a partitioned table. Lookups by
-- `id` alone still work via the per-partition PKs.
--
-- ponytail: the copy is a single `INSERT … SELECT` under one transaction —
-- fine at current audit-log sizes (est. <5M rows); for a multi-year prod
-- table with 100M+ rows, run this during a low-traffic window.

BEGIN;

-- 1. Preserve data.
ALTER TABLE "AuditLog" RENAME TO "AuditLog_legacy";

-- Free the index/constraint names the recreated table needs below.
ALTER INDEX "AuditLog_pkey" RENAME TO "AuditLog_legacy_pkey";
ALTER INDEX "AuditLog_entity_entityId_idx" RENAME TO "AuditLog_legacy_entity_entityId_idx";
ALTER INDEX "AuditLog_actorId_idx" RENAME TO "AuditLog_legacy_actorId_idx";
ALTER INDEX "AuditLog_createdAt_id_idx" RENAME TO "AuditLog_legacy_createdAt_id_idx";

-- 2. Recreate as partitioned — same columns, same defaults.
CREATE TABLE "AuditLog" (
  "id"        TEXT NOT NULL,
  "actorId"   TEXT,
  "action"    TEXT NOT NULL,
  "entity"    TEXT NOT NULL,
  "entityId"  TEXT,
  "before"    JSONB,
  "after"     JSONB,
  "storeId"   TEXT,
  "ip"        TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

-- Recreate the model's indexes; each carries createdAt so partition-pruning
-- stays effective when a query filters by the other leading column.
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId", "createdAt");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt", "id");

-- 3. Re-apply the outbound FK. SET NULL matches the original migration.
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Pre-create monthly partitions. Current month + next 14; the rotate job
--    keeps the window sliding.
--
-- The window starts at the OLDEST legacy row's month, not the current month:
-- step 5's INSERT needs a partition for every existing createdAt, and rows
-- predate the current month on any real table. (Original version started at
-- the current month and failed on any history.)
DO $$
DECLARE
  base DATE := date_trunc('month', CURRENT_DATE)::DATE;
  oldest DATE;
  start_date DATE;
  end_date DATE;
  pname TEXT;
BEGIN
  SELECT date_trunc('month', MIN("createdAt"))::DATE INTO oldest FROM "AuditLog_legacy";
  start_date := COALESCE(oldest, base);
  WHILE start_date < base + '15 month'::INTERVAL LOOP
    end_date := start_date + '1 month'::INTERVAL;
    pname := format('AuditLog_p_%s', to_char(start_date, 'YYYY_MM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "AuditLog" FOR VALUES FROM (%L) TO (%L)',
      pname, start_date, end_date
    );
    start_date := end_date;
  END LOOP;
END $$;

-- 5. Copy legacy rows; createdAt preserved → each lands in the right partition.
INSERT INTO "AuditLog" SELECT * FROM "AuditLog_legacy";

-- 6. Drop legacy. Kept transactional so the operator can postpone the drop by
--    editing this file if they want a rollback window.
SAVEPOINT drop_legacy;
DROP TABLE "AuditLog_legacy";
RELEASE SAVEPOINT drop_legacy;

COMMIT;
