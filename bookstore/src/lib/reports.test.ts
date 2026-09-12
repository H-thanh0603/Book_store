// Reports lib unit test. Mocks prisma + redis so the builders run
// against deterministic in-memory stores. The three revenue reports now
// execute raw GROUP BY SQL — the mock intercepts $queryRaw and returns
// rows shaped exactly as Postgres would (bigint aggregates, one row per
// group). Covers: output shape/ordering/summary maths, cache hit
// short-circuits the prisma call, CSV adds a BOM and escapes commas/quotes.
import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => {
  const store = new Map<string, any>();
  const findMany = vi.fn(async () => {
    return [...store.values()];
  });
  // Raw GROUP BY results per report type, set by each test.
  const sqlResults: Record<string, any[]> = {};
  const queryRaw = vi.fn(async (_tag: TemplateStringsArray, ..._rest: any[]) => {
    // Distinguish the three reports by the table they mention first.
    const sql = String(_tag);
    if (sql.includes("latest_cost")) return sqlResults.storePnl ?? [];
    if (sql.includes('FROM "Store" s')) return sqlResults.revenueByStore ?? [];
    if (sql.includes('FROM "PosTransaction"')) return sqlResults.topStaff ?? [];
    if (sql.includes('FROM "InventoryBalance" b')) return sqlResults.slowStock ?? [];
    if (sql.includes("AS category")) return sqlResults.revenueByCategory ?? [];
    if (sql.includes("LIMIT 50")) return sqlResults.topSku ?? [];
    return [];
  });
  return { store, findMany, sqlResults, queryRaw };
});

const { store, findMany, sqlResults, queryRaw } = hoisted;

vi.mock("./db", () => ({
  prisma: {
    inventoryBalance: { findMany: hoisted.findMany },
    $queryRaw: hoisted.queryRaw,
  },
}));

const memCache = vi.hoisted(() => new Map<string, any>());
vi.mock("./redis", () => ({
  cacheGet: vi.fn(async (k: string) => memCache.get(k) ?? null),
  cacheSet: vi.fn(async (k: string, v: any) => { memCache.set(k, v); }),
  cacheFlush: vi.fn(async (p: string) => { for (const k of memCache.keys()) if (k.startsWith(p.replace(/\*$/, ""))) memCache.delete(k); }),
}));

import { revenueByStore, revenueByCategory, topSku, stockOnHand, storePnl, topStaff, slowStock, toCsv } from "./reports";

const P = { from: new Date("2026-08-01"), to: new Date("2026-08-31T23:59:59"), orgId: "org-A" };

beforeEach(() => {
  store.clear(); memCache.clear(); findMany.mockClear(); queryRaw.mockClear();
  Object.keys(sqlResults).forEach((k) => delete sqlResults[k]);
});

describe("revenueByStore", () => {
  it("maps SQL rows to report shape, summary totals over bigint", async () => {
    sqlResults.revenueByStore = [
      { name: "Q2", code: "Q2", revenue: 300_000n, orders: 1n },
      { name: "Q1", code: "Q1", revenue: 100_000n, orders: 1n },
    ];
    const r = await revenueByStore(P);
    expect(r.columns).toEqual(["Cửa hàng", "Mã", "Doanh thu (đ)", "Số đơn"]);
    expect(r.rows[0]).toEqual(["Q2", "Q2", 300000, 1]);
    expect(r.rows[1]).toEqual(["Q1", "Q1", 100000, 1]);
    expect(r.summary).toEqual({ totalRevenue: 400000, totalOrders: 2 });
  });

  it("stores with zero revenue in the window still appear (LEFT JOIN semantics)", async () => {
    sqlResults.revenueByStore = [{ name: "Q1", code: "Q1", revenue: 0n, orders: 0n }];
    const r = await revenueByStore(P);
    expect(r.rows).toEqual([["Q1", "Q1", 0, 0]]);
    expect(r.summary).toEqual({ totalRevenue: 0, totalOrders: 0 });
  });
});

describe("revenueByCategory", () => {
  it("maps grouped rows and computes the summary from the groups", async () => {
    sqlResults.revenueByCategory = [
      { category: "Thiếu nhi", revenue: 150_000n, qty: 1n },
      { category: "Văn học", revenue: 100_000n, qty: 2n },
    ];
    const r = await revenueByCategory(P);
    expect(r.rows).toEqual([["Thiếu nhi", 150000, 1], ["Văn học", 100000, 2]]);
    expect(r.summary).toEqual({ totalRevenue: 250000, totalQuantity: 3 });
  });

  it("labels NULL-category rows as (chưa phân loại)", async () => {
    sqlResults.revenueByCategory = [{ category: null, revenue: 42n, qty: 1n }];
    const r = await revenueByCategory(P);
    expect(r.rows[0][0]).toBe("(chưa phân loại)");
  });
});

describe("topSku", () => {
  it("passes SQL rows through (LIMIT already applied in the query)", async () => {
    sqlResults.topSku = Array.from({ length: 50 }, (_, i) => ({
      sku: `SKU-${i}`, name: `P${i}`, revenue: BigInt((50 - i) * 1000), qty: 1n,
    }));
    const r = await topSku(P);
    expect(r.rows).toHaveLength(50);
    expect(r.rows[0]).toEqual(["SKU-0", "P0", 50000, 1]);
    expect(r.rows[49][0]).toBe("SKU-49");
  });
});

describe("stockOnHand", () => {
  it("rolls up by SKU+store+location and computes value", async () => {
    // Mock matches the fixed stockOnHand select: onHand + current retail
    // price row (the old `quantity`/`variant.price` columns never existed).
    store.set("b1", { onHand: 10, variant: { sku: "S1", product: { name: "A" }, prices: [{ amount: 1000n }] }, location: { name: "Shelf", store: { name: "Q1", code: "Q1" } } });
    store.set("b2", { onHand: 5, variant: { sku: "S1", product: { name: "A" }, prices: [{ amount: 1000n }] }, location: { name: "Stock", store: { name: "Q1", code: "Q1" } } });
    const r = await stockOnHand(P);
    expect(r.rows[0]).toEqual(["S1", "A", "Q1", "Shelf", 10, 10000]);
    expect(r.rows[1]).toEqual(["S1", "A", "Q1", "Stock", 5, 5000]);
    expect(r.summary?.totalValue).toBe(15000);
  });
});

describe("storePnl (N5a)", () => {
  it("computes gross profit and flags unpriced quantities", async () => {
    sqlResults.storePnl = [
      { name: "Q1", code: "Q1", revenue: 1_000_000n, discount: 50_000n, shipping: 30_000n, orders: 10n, cogs: 600_000n, unpricedQty: 2n },
    ];
    const r = await storePnl(P);
    expect(r.columns).toContain("Lợi nhuận gộp (đ)");
    expect(r.rows[0]).toEqual(["Q1", "Q1", 1000000, 50000, 30000, 600000, 400000, 10]);
    expect(r.summary).toMatchObject({ totalRevenue: 1000000, totalCogs: 600000, grossProfit: 400000, unpricedQty: 2 });
  });
});

describe("topStaff (N5b)", () => {
  it("ranks cashiers by POS revenue", async () => {
    sqlResults.topStaff = [
      { name: "a@x.vn", email: "a@x.vn", revenue: 500_000n, txns: 5n },
      { name: "b@x.vn", email: "b@x.vn", revenue: 100_000n, txns: 2n },
    ];
    const r = await topStaff(P);
    expect(r.columns).toEqual(["Nhân viên", "Doanh thu (đ)", "Số giao dịch"]);
    expect(r.rows[0]).toEqual(["a@x.vn", 500000, 5]);
  });
});

describe("slowStock (N5c)", () => {
  it("keeps only rows with no recent sale and values them", async () => {
    const old = new Date("2026-01-01");
    const recent = new Date("2026-08-20");
    sqlResults.slowStock = [
      { sku: "S1", name: "A", store: "Q1", qty: 10, price: 20000n, lastSale: old },
      { sku: "S2", name: "B", store: "Q1", qty: 3, price: 5000n, lastSale: recent },
      { sku: "S3", name: "C", store: "Q1", qty: 2, price: 10000n, lastSale: null },
    ];
    const r = await slowStock(P);
    expect(r.rows.map((x) => x[0])).toEqual(["S1", "S3"]);
    expect(r.summary).toMatchObject({ slowSkus: 2, slowValue: 10 * 20000 + 2 * 10000 });
  });
});

describe("cache + CSV", () => {
  it("second call within TTL skips prisma", async () => {
    sqlResults.revenueByStore = [{ name: "Q1", code: "Q1", revenue: 1n, orders: 1n }];
    await revenueByStore(P);
    const callsAfterFirst = queryRaw.mock.calls.length;
    await revenueByStore(P);
    expect(queryRaw.mock.calls.length).toBe(callsAfterFirst);
  });

  it("toCsv emits BOM, header, rows, and escapes commas/quotes", () => {
    const csv = toCsv({
      columns: ["A", "B"],
      rows: [["x,y", 'q"uote'], ["ok", 1]],
    });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")[0]).toBe("﻿A,B");
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"q""uote"');
  });
});
