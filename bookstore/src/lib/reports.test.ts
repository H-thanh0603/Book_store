// Reports lib unit test. Mocks prisma + redis so the builders run
// against deterministic in-memory stores. Covers: each of the 4
// types produces the right shape, cache hit short-circuits the
// prisma call, CSV adds a BOM and escapes commas/quotes.
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, any>();
const findMany = vi.fn(async ({ where }: any) => {
  return [...store.values()].filter((row: any) => {
    if (where?.status?.in && !where.status.in.includes(row.status)) return false;
    if (where?.createdAt?.gte && row.createdAt < where.createdAt.gte) return false;
    if (where?.createdAt?.lte && row.createdAt > where.createdAt.lte) return false;
    if (where?.store?.region?.orgId && row._orgId !== where.store.region.orgId) return false;
    if (where?.store?.id && row.storeId !== where.store.id) return false;
    if (where?.order) {
      if (where.order.createdAt?.gte && row._orderCreatedAt < where.order.createdAt.gte) return false;
      if (where.order.createdAt?.lte && row._orderCreatedAt > where.order.createdAt.lte) return false;
      if (where.order.status?.in && !where.order.status.in.includes(row._orderStatus)) return false;
      if (where.order.store?.region?.orgId && row._orderOrgId !== where.order.store.region.orgId) return false;
    }
    return true;
  });
});

vi.mock("./db", () => ({ prisma: { order: { findMany }, orderItem: { findMany: findMany }, inventoryBalance: { findMany: findMany } } }));

const memCache = new Map<string, any>();
vi.mock("./redis", () => ({
  cacheGet: vi.fn(async (k: string) => memCache.get(k) ?? null),
  cacheSet: vi.fn(async (k: string, v: any) => { memCache.set(k, v); }),
  cacheFlush: vi.fn(async (p: string) => { for (const k of memCache.keys()) if (k.startsWith(p.replace(/\*$/, ""))) memCache.delete(k); }),
}));

import { revenueByStore, revenueByCategory, topSku, stockOnHand, toCsv } from "./reports";

const P = { from: new Date("2026-08-01"), to: new Date("2026-08-31T23:59:59"), orgId: "org-A" };

beforeEach(() => {
  store.clear(); memCache.clear(); findMany.mockClear();
});

describe("revenueByStore", () => {
  it("aggregates per store, sorts by revenue desc, summary totals", async () => {
    store.set("o1", { id: "o1", total: 100_000n, status: "PAID", storeId: "s1", store: { id: "s1", name: "Q1", code: "Q1" }, _orgId: "org-A", createdAt: new Date("2026-08-15") });
    store.set("o2", { id: "o2", total: 300_000n, status: "PAID", storeId: "s2", store: { id: "s2", name: "Q2", code: "Q2" }, _orgId: "org-A", createdAt: new Date("2026-08-16") });
    store.set("o3", { id: "o3", total: 50_000n, status: "CANCELLED", storeId: "s1", store: { id: "s1", name: "Q1", code: "Q1" }, _orgId: "org-A", createdAt: new Date("2026-08-17") });
    const r = await revenueByStore(P);
    expect(r.columns).toEqual(["Cửa hàng", "Mã", "Doanh thu (đ)", "Số đơn"]);
    expect(r.rows[0]).toEqual(["Q2", "Q2", 300000, 1]);
    expect(r.rows[1]).toEqual(["Q1", "Q1", 100000, 1]);
    expect(r.summary).toEqual({ totalRevenue: 400000, totalOrders: 2 });
  });
});

describe("revenueByCategory", () => {
  it("sums line revenue and groups by category", async () => {
    store.set("i1", { quantity: 2, unitPrice: 50_000n, discount: 0n, _orderStatus: "PAID", _orderCreatedAt: new Date("2026-08-10"), _orderOrgId: "org-A",
      variant: { product: { category: { name: "Văn học" } } } });
    store.set("i2", { quantity: 1, unitPrice: 200_000n, discount: 50_000n, _orderStatus: "PAID", _orderCreatedAt: new Date("2026-08-11"), _orderOrgId: "org-A",
      variant: { product: { category: { name: "Thiếu nhi" } } } });
    const r = await revenueByCategory(P);
    expect(r.rows).toEqual([["Thiếu nhi", 150000, 1], ["Văn học", 100000, 2]]);
    expect(r.summary).toEqual({ totalRevenue: 250000, totalQuantity: 3 });
  });
});

describe("topSku", () => {
  it("caps at 50 and sorts by revenue desc", async () => {
    for (let i = 0; i < 60; i++) {
      store.set(`it-${i}`, { quantity: 1, unitPrice: BigInt((60 - i) * 1000), discount: 0n, _orderStatus: "PAID",
        _orderCreatedAt: new Date("2026-08-15"), _orderOrgId: "org-A",
        variant: { sku: `SKU-${i}`, product: { name: `P${i}` } } });
    }
    const r = await topSku(P);
    expect(r.rows).toHaveLength(50);
    expect(r.rows[0][0]).toBe("SKU-0");
    expect(r.rows[0][2]).toBe(60_000);
  });
});

describe("stockOnHand", () => {
  it("rolls up by SKU+store+location and computes value", async () => {
    store.set("b1", { quantity: 10, variant: { sku: "S1", product: { name: "A" }, price: 1000n }, location: { name: "Shelf", store: { name: "Q1", code: "Q1" } } });
    store.set("b2", { quantity: 5, variant: { sku: "S1", product: { name: "A" }, price: 1000n }, location: { name: "Stock", store: { name: "Q1", code: "Q1" } } });
    const r = await stockOnHand(P);
    expect(r.rows[0]).toEqual(["S1", "A", "Q1", "Shelf", 10, 10000]);
    expect(r.rows[1]).toEqual(["S1", "A", "Q1", "Stock", 5, 5000]);
    expect(r.summary?.totalValue).toBe(15000);
  });
});

describe("cache + CSV", () => {
  it("second call within TTL skips prisma", async () => {
    store.set("o1", { id: "o1", total: 1n, status: "PAID", storeId: "s1", store: { id: "s1", name: "Q1", code: "Q1" }, _orgId: "org-A", createdAt: new Date("2026-08-15") });
    await revenueByStore(P);
    const callsAfterFirst = findMany.mock.calls.length;
    await revenueByStore(P);
    expect(findMany.mock.calls.length).toBe(callsAfterFirst);
  });

  it("toCsv emits BOM, header, rows, and escapes commas/quotes", () => {
    const csv = toCsv({
      columns: ["A", "B"],
      rows: [["x,y", 'q"uote'], ["ok", 1]],
    });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")[0]).toBe("A,B");
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"q""uote"');
  });
});
