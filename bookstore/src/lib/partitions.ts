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
