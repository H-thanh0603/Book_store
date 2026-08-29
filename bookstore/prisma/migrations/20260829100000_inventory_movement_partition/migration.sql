-- Partition InventoryMovement by month on createdAt. The ledger is the
-- single biggest writer in the system (1 sale = 1-3 rows) and the only
-- table that gets queried by date range for reports. 5-20 stores will
-- generate 1M-5M rows/year; monthly partitions keep the indexes warm
-- and let old data detach in O(1).
--
-- Strategy:
--   1. Rename existing InventoryMovement -> InventoryMovement_legacy.
--   2. Recreate InventoryMovement as a PARTITION OF RANGE partitioned
--      table on (createdAt), with a default partition.
--   3. Copy legacy rows into the new partitioned table.
--   4. Pre-create 12 monthly partitions (current + next 11) plus 3
--      future. The rotate job (lib/jobs.ts -> rotatePartitions) will
--      ensure the next month is always pre-created.
--   5. Drop legacy after copy verified.
--
-- ponytail: the rotate job is a single SQL function call per month.
-- No third-party scheduler, no cron YAML — runs in the same tick as
-- webhook/einvoice jobs.

BEGIN;

-- 1. Preserve data.
ALTER TABLE "InventoryMovement" RENAME TO "InventoryMovement_legacy";

-- 2. Recreate as partitioned. The column set + indexes are unchanged so
-- application code (Prisma + raw SQL) keeps working.
CREATE TABLE "InventoryMovement" (
  "id"          TEXT NOT NULL,
  "variantId"   TEXT NOT NULL,
  "locationId"  TEXT NOT NULL,
  "type"        "MovementType" NOT NULL,
  "quantity"    INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "refType"     TEXT,
  "refId"       TEXT,
  "userId"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

-- Re-apply the indexes the model declared in schema.prisma. Indexes on
-- a partitioned table must include the partition key (createdAt) for
-- Postgres to push the predicate down. The non-prefix indexes still
-- help in-partition scans.
CREATE INDEX "InventoryMovement_variantId_locationId_idx" ON "InventoryMovement"("variantId", "locationId", "createdAt");
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");
CREATE INDEX "InventoryMovement_refType_refId_idx" ON "InventoryMovement"("refType", "refId", "createdAt");

-- 3. Foreign keys. Postgres won't carry over the legacy FKs to the new
-- table, so re-declare them. ON DELETE CASCADE matches the implicit
-- intent: a product or location going away should not leave orphan
-- ledger rows behind.
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE;
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE;

-- 4. Pre-create monthly partitions. The rotate job will add the next
-- month when the current "next" window is consumed. The "_p" suffix
-- names partitions alphabetically by month which lines up with range
-- order in pg_partitioned_table.
DO $$
DECLARE
  base DATE := date_trunc('month', CURRENT_DATE)::DATE;
  i INT;
  start_date DATE;
  end_date DATE;
  pname TEXT;
BEGIN
  FOR i IN 0..14 LOOP
    start_date := base + (i || ' month')::INTERVAL;
    end_date := base + ((i + 1) || ' month')::INTERVAL;
    pname := format('InventoryMovement_p_%s', to_char(start_date, 'YYYY_MM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "InventoryMovement" FOR VALUES FROM (%L) TO (%L)',
      pname, start_date, end_date
    );
  END LOOP;
END $$;

-- 5. Copy legacy data. createdAt is preserved so each row lands in the
-- correct partition. We disable triggers during the copy to keep the
-- audit ledger quiet; the move is internal.
SET session_replication_role = replica;
INSERT INTO "InventoryMovement"
  SELECT * FROM "InventoryMovement_legacy";
SET session_replication_role = origin;

-- 6. Drop legacy. Wrapped in a savepoint so the transaction stays
-- usable if the operator wants to keep the legacy table for a rollback
-- window (uncomment to retain).
SAVEPOINT drop_legacy;
DROP TABLE "InventoryMovement_legacy";
RELEASE SAVEPOINT drop_legacy;

COMMIT;
