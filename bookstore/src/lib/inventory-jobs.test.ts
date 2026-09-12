import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  balances: [] as any[],
  counts: [] as any[],
  lastPosted: null as any,
  created: [] as any[],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    stockLocation: { findMany: vi.fn(async () => [{ id: "loc-1" }]) },
    inventoryCount: {
      findFirst: vi.fn(async (args: any) =>
        args.where.status === "DRAFT" ? null : hoisted.lastPosted
      ),
      create: vi.fn(async (args: any) => {
        hoisted.created.push(args);
        return { id: "c1" };
      }),
    },
    inventoryBalance: {
      findMany: vi.fn(async () => hoisted.balances),
    },
    userRole: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("./api", () => ({
  getSystemConfig: vi.fn(async (_k: string, fallback: any) => fallback),
  nextBusinessNumber: vi.fn(async () => "IC-1"),
}));

vi.mock("./mail", () => ({ sendMail: vi.fn(async () => ({ delivered: true })) }));

import { runCycleCounts, scanLowStockMail } from "./inventory-jobs";

describe("runCycleCounts", () => {
  beforeEach(() => {
    hoisted.balances = [];
    hoisted.lastPosted = null;
    hoisted.created = [];
  });

  it("creates a DRAFT count snapshotting onHand as expectedQty", async () => {
    hoisted.balances = [{ variantId: "v1", onHand: 7 }];
    const r = await runCycleCounts();
    expect(r).toEqual({ created: 1 });
    expect(hoisted.created[0].data.items.create).toEqual([
      { variantId: "v1", expectedQty: 7, countedQty: 0 },
    ]);
  });

  it("skips locations with no stock", async () => {
    hoisted.balances = [];
    await expect(runCycleCounts()).resolves.toEqual({ created: 0 });
  });

  it("skips recently counted locations", async () => {
    hoisted.lastPosted = { postedAt: new Date() };
    hoisted.balances = [{ variantId: "v1", onHand: 7 }];
    await expect(runCycleCounts()).resolves.toEqual({ created: 0 });
  });
});

describe("scanLowStockMail", () => {
  it("returns zero when nothing is low", async () => {
    hoisted.balances = [];
    await expect(scanLowStockMail()).resolves.toEqual({ storesNotified: 0 });
  });
});
