import { describe, expect, it, vi, beforeEach } from "vitest";
import { pctChange } from "./merchant-anomaly";

const hoisted = vi.hoisted(() => {
  const state = {
    dailySeriesRows: [] as { day: string; revenue: bigint; orders: number }[],
    balances: [] as any[],
    sales: [] as { variantId: string; _sum: { quantity: number | null } }[],
    staged: 0,
    poPending: 0,
    curAgg: { _sum: { total: 0n }, _count: { _all: 0 } },
    baseAgg: { _sum: { total: 0n }, _count: { _all: 0 } },
    curSales: [] as { variantId: string; _sum: { quantity: number | null } }[],
    baseSales: [] as { variantId: string; _sum: { quantity: number | null } }[],
    variants: [] as any[],
  };
  const mkPrisma: any = {
    $queryRaw: vi.fn(async () => state.dailySeriesRows),
    inventoryBalance: { findMany: vi.fn(async () => state.balances) },
    inventoryMovement: {
      groupBy: vi.fn(async (args: any) => {
        // whyRevenueChanged: two groupBy in Promise.all — route by date filter.
        const gte: Date | undefined = args?.where?.createdAt?.gte;
        const lt: Date | undefined = args?.where?.createdAt?.lt;
        if (gte && lt) return state.baseSales;      // [base0, cur0)
        if (gte && !lt) {                            // could be stockout-sale OR cur0
          return state.curSales;
        }
        return state.sales;
      }),
    },
    stagedChange: { count: vi.fn(async () => state.staged) },
    purchaseOrder: { count: vi.fn(async () => state.poPending) },
    order: {
      aggregate: vi.fn(async (args: any) => {
        const lt = args?.where?.createdAt?.lt;
        return lt ? state.baseAgg : state.curAgg;
      }),
    },
    productVariant: { findMany: vi.fn(async () => state.variants) },
  };
  return { state, mkPrisma };
});

vi.mock("./db", () => ({ prisma: hoisted.mkPrisma }));

import { scanAnomalies, whyRevenueChanged } from "./merchant-anomaly";

const scope = { orgId: "org-1", storeIds: [], permissions: [] as string[] } as any;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(hoisted.state, {
    dailySeriesRows: [], balances: [], sales: [],
    staged: 0, poPending: 0,
    curAgg: { _sum: { total: 0n }, _count: { _all: 0 } },
    baseAgg: { _sum: { total: 0n }, _count: { _all: 0 } },
    curSales: [], baseSales: [], variants: [],
  });
});

describe("pctChange", () => {
  it("returns null on empty baseline", () => {
    expect(pctChange(0, 0)).toBeNull();
    expect(pctChange(5, 0)).toBe(100);
  });
  it("rounds pct drop", () => {
    expect(pctChange(70, 100)).toBe(-30);
    expect(pctChange(110, 100)).toBe(10);
  });
});

describe("scanAnomalies", () => {
  it("flags revenue_drop when today collapses vs 14d baseline", async () => {
    hoisted.state.dailySeriesRows = Array.from({ length: 15 }, (_, i) => ({
      day: `2026-09-${String(i + 1).padStart(2, "0")}`,
      revenue: i === 14 ? 500_000n : 2_000_000n,
      orders: i === 14 ? 10 : 20,
    }));
    const out = await scanAnomalies(scope);
    expect(out.some((a) => a.kind === "revenue_drop" && a.severity === "urgent")).toBe(true);
  });

  it("flags stockout_risk for fast seller with thin cover", async () => {
    hoisted.state.balances = [{
      variantId: "v1", onHand: 5, reserved: 0,
      variant: { sku: "S1", product: { name: "Sách hot" } },
    }];
    // 14 sales/day → 5 on hand ≈ 0.36 days cover ≤ 7
    // (stockout query also carries gte-without-lt, so seed curSales)
    hoisted.state.curSales = [{ variantId: "v1", _sum: { quantity: -196 } }];
    const out = await scanAnomalies(scope);
    const risk = out.find((a) => a.kind === "stockout_risk");
    expect(risk?.severity).toBe("urgent");
  });

  it("flags pending_approvals when queues are non-empty", async () => {
    hoisted.state.staged = 2;
    hoisted.state.poPending = 1;
    const out = await scanAnomalies(scope);
    const p = out.find((a) => a.kind === "pending_approvals");
    expect(p?.evidence).toMatchObject({ staged: 2, purchaseOrders: 1 });
  });

  it("returns empty when nothing anomalous", async () => {
    hoisted.state.dailySeriesRows = Array.from({ length: 15 }, (_, i) => ({
      day: `2026-09-${String(i + 1).padStart(2, "0")}`,
      revenue: 2_000_000n, orders: 20,
    }));
    expect(await scanAnomalies(scope)).toEqual([]);
  });
});

describe("whyRevenueChanged", () => {
  it("blames a stocked-out decliner when revenue drops", async () => {
    hoisted.state.curAgg = { _sum: { total: 500_000n }, _count: { _all: 10 } };
    hoisted.state.baseAgg = { _sum: { total: 2_000_000n }, _count: { _all: 30 } };
    hoisted.state.curSales = [{ variantId: "v1", _sum: { quantity: -1 } }];
    hoisted.state.baseSales = [{ variantId: "v1", _sum: { quantity: -10 } }];
    hoisted.state.variants = [{
      id: "v1", sku: "S1", product: { name: "Sách hot" },
      balances: [{ onHand: 0, reserved: 0 }],
    }];
    const out = await whyRevenueChanged(scope, 7);
    expect(out.revenue.pct).toBe(-75);
    expect(out.topDecliners[0]).toMatchObject({ variantId: "v1", outOfStockDays: 7 });
    expect(out.hypothesis).toContain("hết hàng");
  });

  it("says revenue is fine when it did not drop", async () => {
    hoisted.state.curAgg = { _sum: { total: 3_000_000n }, _count: { _all: 30 } };
    hoisted.state.baseAgg = { _sum: { total: 2_000_000n }, _count: { _all: 20 } };
    const out = await whyRevenueChanged(scope, 7);
    expect(out.hypothesis).toContain("không giảm");
  });
});
