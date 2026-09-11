// InventoryMovement monthly partition rotation. The migration that
// created the partitioned table pre-creates 15 months (current + 14
// future). This job is the safety net: if the DB has been alive past
// the pre-created window, it materialises the next month. Idempotent —
// CREATE TABLE IF NOT EXISTS is a no-op if the partition already
// exists.
//
// ponytail: the 3-month lookahead in the migration is the primary
// defense. The job's job is to prevent "oh no, writes started failing
// because there was no partition for next month" at 3am. Frequency is
// daily (cheap, runs in <50ms against pg_class).

import { prisma } from "./db";

// How many months ahead of "now" must always exist. Matches the
// migration's pre-create window.
const LOOKAHEAD_MONTHS = 3;

// RETENTION: how many months of live partitions to keep attached.
// Partitions older than this are DETACHED (not dropped) by
// detachOldInventoryPartitions — see below.
const PARTITION_RETENTION_MONTHS = (() => {
  const n = Number(process.env.INVENTORY_PARTITION_RETENTION_MONTHS);
  return Number.isInteger(n) && n > 0 ? n : 18;
})();

export async function rotateInventoryPartitions(): Promise<{ created: string[] }> {
  const created: string[] = [];
  // We can't issue DDL through Prisma's queryRaw, so drop to the
  // pg driver via $executeRawUnsafe. The SQL is parameterised by
  // computed values that we control (the start of each month).
  const base = new Date();
  base.setUTCDate(1);
  base.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i <= LOOKAHEAD_MONTHS; i++) {
    const start = new Date(base);
    start.setUTCMonth(base.getUTCMonth() + i);
    const end = new Date(base);
    end.setUTCMonth(base.getUTCMonth() + i + 1);
    const pname = `InventoryMovement_p_${start.toISOString().slice(0, 7).replace("-", "_")}`;
    // pg's create extension is on; raw is safe here because all
    // interpolated values are computed from a Date object, not user input.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${pname}" PARTITION OF "InventoryMovement" FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`
    );
    created.push(pname);
  }
  return { created };
}

/** DETACH (not drop) InventoryMovement partitions older than the
 *  retention window.
 *
 *  Why detach instead of drop: the monthly rows leave the parent table's
 *  index/planner surface (scans get cheaper, autovacuum stops rewriting
 *  cold partitions) but the DATA STAYS — a detached table can be
 *  re-attached in seconds if finance or a dispute needs movement history
 *  beyond the window. Dropping is a manual, deliberate ops action after
 *  retention requirements are confirmed.
 *
 *  Partition names are InventoryMovement_p_YYYY_MM (rotation contract), so
 *  the month is parsed straight from the name. Idempotent: partitions
 *  already detached are absent from pg_inherits, so the query skips them. */
export async function detachOldInventoryPartitions(): Promise<{ detached: string[] }> {
  const cutoff = new Date();
  cutoff.setUTCDate(1);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - PARTITION_RETENTION_MONTHS);

  // Children of InventoryMovement still attached. relispartition guarantees
  // we only see live partitions (detached ones are standalone tables). The
  // parent identifier is double-quoted because 'InventoryMovement'::regclass
  // without quotes folds to lowercase and finds nothing (Prisma model names
  // are case-sensitive in Postgres).
  const rows = await prisma.$queryRaw<Array<{ relname: string }>>`
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = '"InventoryMovement"'::regclass
      AND c.relispartition
  `;

  const detached: string[] = [];
  for (const { relname } of rows) {
    const m = /^InventoryMovement_p_(\d{4})_(\d{2})$/.exec(relname);
    if (!m) continue; // unknown naming — never detach what we didn't create
    const monthStart = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
    if (monthStart >= cutoff) continue; // inside the retention window
    await prisma.$executeRawUnsafe(`ALTER TABLE "InventoryMovement" DETACH PARTITION "${relname}"`);
    detached.push(relname);
  }
  return { detached };
}
