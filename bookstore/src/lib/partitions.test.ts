import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture each CREATE TABLE statement the lib issues so we can assert
// shape without booting Postgres.
const calls: string[] = [];
vi.mock("./db", () => ({
  prisma: {
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      calls.push(sql);
    }),
  },
}));

import { rotateInventoryPartitions } from "./partitions";

beforeEach(() => {
  calls.length = 0;
});

describe("rotateInventoryPartitions", () => {
  it("issues one CREATE TABLE per month in the lookahead window", async () => {
    const out = await rotateInventoryPartitions();
    // LOOKAHEAD_MONTHS=3 inclusive of current month => 4 statements.
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(c).toMatch(/^CREATE TABLE IF NOT EXISTS "InventoryMovement_p_\d{4}_\d{2}" PARTITION OF "InventoryMovement" FOR VALUES FROM \(.*\) TO \(.*\)$/);
    }
    expect(out.created).toHaveLength(4);
  });

  it("is idempotent — repeated calls don't fail or duplicate", async () => {
    await rotateInventoryPartitions();
    await rotateInventoryPartitions();
    // Same number of statements, no error.
    expect(calls).toHaveLength(8);
    // The IF NOT EXISTS clause is what makes this safe; verify it's
    // present in every call.
    for (const c of calls) expect(c).toContain("IF NOT EXISTS");
  });
});
