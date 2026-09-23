import { describe, expect, it, vi, beforeEach } from "vitest";
import { EXPORT_TYPES, exportTruncated } from "./datasets";

const hoisted = vi.hoisted(() => {
  const state = {
    products: [] as any[],
    orders: [] as any[],
    balances: [] as any[],
    customers: [] as any[],
    queryRows: [] as any[],
  };
  const prismaMock: any = {
    product: { findMany: vi.fn(async () => state.products) },
    order: {
      findMany: vi.fn(async () => state.orders),
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => state.customers.map((c: any) => ({
        customerId: c.id, _count: { _all: 3 }, _sum: { total: 900_000n },
      }))),
    },
    inventoryBalance: {
      findMany: vi.fn(async () => state.balances),
      count: vi.fn(async () => 0),
    },
    customer: {
      findMany: vi.fn(async () => state.customers.map((c: any) => ({
        id: c.id ?? "c1", code: c.code, name: c.name, phone: c.phone, email: c.email,
        loyalty: c.loyalty,
      }))),
      count: vi.fn(async () => 0),
    },
    $queryRaw: vi.fn(async () => state.queryRows),
  };
  return { state, prismaMock };
});

vi.mock("@/lib/db", () => ({ prisma: hoisted.prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(hoisted.state, { products: [], orders: [], balances: [], customers: [], queryRows: [] });
});

describe("exportTruncated", () => {
  it("carries status 413 and the overflow count", () => {
    const e = exportTruncated(37) as any;
    expect(e.status).toBe(413);
    expect(e.code).toBe("EXPORT_TRUNCATED");
    expect(e.message).toContain("37");
  });
});

describe("EXPORT_TYPES metadata", () => {
  it("guards every export behind the same permission as its UI surface", () => {
    expect(EXPORT_TYPES.products.permission).toBe("product.view");
    expect(EXPORT_TYPES.orders.permission).toBe("reports.store.view");
    expect(EXPORT_TYPES.inventory.permission).toBe("inventory.view");
    expect(EXPORT_TYPES.customers.permission).toBe("customer.view");
    expect(EXPORT_TYPES.revenue.permission).toBe("reports.financial.view");
  });

  it("exposes non-empty column sets with Vietnamese headers", () => {
    for (const t of Object.values(EXPORT_TYPES)) {
      const cols: any[] = (t.columns as any)();
      expect(cols.length).toBeGreaterThan(0);
      for (const c of cols) {
        expect(c.key).toBeTruthy();
        expect(c.header).toBeTruthy();
      }
    }
  });
});

describe("fetch fns", () => {
  it("products: flattens active variants with price + stock", async () => {
    hoisted.state.products = [{
      name: "Sách A", category: { name: "Sách" }, brand: null, author: { name: "Tác giả" },
      variants: [
        { active: true, sku: "SA-1", prices: [{ amount: 100_000n }], balances: [{ onHand: 5, reserved: 1 }] },
        { active: false, sku: "SA-0", prices: [], balances: [] },
      ],
    }];
    const rows = await EXPORT_TYPES.products.fetch(null, "org-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sku: "SA-1", onHand: 5 });
    expect(hoisted.prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: "org-1" }) }),
    );
  });

  it("orders: scopes org-wide callers via store/customer org, not all tenants", async () => {
    hoisted.state.orders = [{
      number: "ORD-1", channel: "pos", status: "PAID", total: 200_000n,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      customer: { name: "An", phone: "0901" },
    }];
    const rows = await EXPORT_TYPES.orders.fetch(null, "org-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ number: "ORD-1" });
  });

  it("inventory: maps balances to rows", async () => {
    hoisted.state.balances = [{
      variant: { product: { name: "Sách" }, name: "Bìa cứng" },
      location: { name: "Kệ A" }, onHand: 10, reserved: 2, damaged: 0,
    }];
    const rows = await EXPORT_TYPES.inventory.fetch(["store-1"], "org-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ onHand: 10, reserved: 2 });
  });

  it("customers: maps loyalty + aggregates", async () => {
    hoisted.state.customers = [{
      id: "c1", code: "CUS-1", name: "An", phone: "0901", email: "a@x.vn",
      loyalty: { points: 50 },
    }];
    const rows = await EXPORT_TYPES.customers.fetch(null, "org-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]._count.orders).toBe(3);
    expect(rows[0]._sum.orders.total).toBe(900_000n);
  });

  it("revenue: projects raw rows through the revenue columns", async () => {
    hoisted.state.queryRows = [{ date: "2026-09-01", orders: 5, revenue: 1_000_000, avgOrderValue: 200_000 }];
    const rows = await EXPORT_TYPES.revenue.fetch(null, "org-1");
    expect(rows).toHaveLength(1);
  });
});
