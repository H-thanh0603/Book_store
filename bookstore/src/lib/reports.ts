// 4 canned reports for the Reports page. Each builder is a pure
// async function taking (from, to, orgId, storeId?) and returning
// { columns, rows, summary? }. CSV is built from the same shape
// with a UTF-8 BOM and CRLF so Excel-VN opens it cleanly.
//
// Multi-tenant: every Order-side query joins through store.region
// (Order has no direct orgId). InventoryBalance joins the same way.
// A future C1 (owner mobile) or D2 (partition) might add a direct
// orgId to the read model; until then this join is the truth.
//
// ponytail: revenue numbers come back as BigInt (Đồng); we downcast
// to number for the JSON response and string for the CSV. Owners
// viewing a > 2^53 đồng report (~$2.4M) is not on the roadmap.

import { prisma } from "./db";
import { cacheGet, cacheSet, cacheFlush } from "./redis";

// "COMPLETED" is a PosTransaction status, not an OrderStatus — Order revenue
// states are CONFIRMED/PAID/SHIPPED/DELIVERED. (The stray "COMPLETED" here
// broke Prisma's args inference for every builder in this file.)
const REVENUE_STATUSES = ["CONFIRMED", "PAID", "SHIPPED", "DELIVERED"] as const;

export type ReportParams = {
  from: Date;
  to: Date;
  orgId: string;
  storeId?: string;
};

export type ReportResult = {
  columns: string[];
  rows: (string | number)[][];
  summary?: Record<string, string | number>;
};

function storeScope(orgId: string, storeId?: string) {
  return {
    store: { region: { orgId }, ...(storeId ? { id: storeId } : {}) },
  };
}

function cacheKey(type: string, p: ReportParams) {
  return `reports:${p.orgId}:${type}:${p.from.toISOString().slice(0, 10)}:${p.to.toISOString().slice(0, 10)}:${p.storeId ?? "*"}`;
}

const TTL_SECONDS = 300; // 5 min per the plan

async function cached<T extends ReportResult>(type: string, p: ReportParams, build: () => Promise<T>): Promise<T> {
  const key = cacheKey(type, p);
  const hit = await cacheGet<T>(key);
  if (hit) return hit;
  const value = await build();
  await cacheSet(key, value, TTL_SECONDS);
  return value;
}

export async function revenueByStore(p: ReportParams): Promise<ReportResult> {
  return cached("revenue-by-store", p, async () => {
    const orders = await prisma.order.findMany({
      where: {
        ...storeScope(p.orgId, p.storeId),
        createdAt: { gte: p.from, lte: p.to },
        status: { in: [...REVENUE_STATUSES] },
      },
      select: { total: true, storeId: true, store: { select: { id: true, name: true, code: true } } },
    });
    const byStore = new Map<string, { id: string; name: string; code: string; revenue: bigint; orders: number }>();
    for (const o of orders) {
      const key = o.store?.id ?? "unassigned";
      const cur = byStore.get(key) ?? { id: key, name: o.store?.name ?? "(unassigned)", code: o.store?.code ?? "—", revenue: 0n, orders: 0 };
      cur.revenue += o.total;
      cur.orders += 1;
      byStore.set(key, cur);
    }
    const rows = [...byStore.values()].sort((a, b) => Number(b.revenue - a.revenue))
      .map((r) => [r.name, r.code, Number(r.revenue), r.orders]);
    const total = orders.reduce((s, o) => s + o.total, 0n);
    return {
      columns: ["Cửa hàng", "Mã", "Doanh thu (đ)", "Số đơn"],
      rows,
      summary: { totalRevenue: Number(total), totalOrders: orders.length },
    };
  });
}

export async function revenueByCategory(p: ReportParams): Promise<ReportResult> {
  return cached("revenue-by-category", p, async () => {
    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          ...storeScope(p.orgId, p.storeId),
          createdAt: { gte: p.from, lte: p.to },
          status: { in: [...REVENUE_STATUSES] },
        },
      },
      select: {
        quantity: true,
        unitPrice: true,
        discount: true,
        variant: { select: { product: { select: { category: { select: { name: true } } } } } },
      },
    });
    const byCat = new Map<string, { revenue: bigint; qty: number }>();
    for (const it of items) {
      const cat = it.variant.product.category.name;
      const line = it.unitPrice * BigInt(it.quantity) - it.discount;
      const cur = byCat.get(cat) ?? { revenue: 0n, qty: 0 };
      cur.revenue += line;
      cur.qty += it.quantity;
      byCat.set(cat, cur);
    }
    const rows = [...byCat.entries()].sort((a, b) => Number(b[1].revenue - a[1].revenue))
      .map(([name, v]) => [name, Number(v.revenue), v.qty]);
    const total = items.reduce((s, it) => s + it.unitPrice * BigInt(it.quantity) - it.discount, 0n);
    return {
      columns: ["Danh mục", "Doanh thu (đ)", "Số lượng"],
      rows,
      summary: { totalRevenue: Number(total), totalQuantity: items.reduce((s, i) => s + i.quantity, 0) },
    };
  });
}

export async function topSku(p: ReportParams): Promise<ReportResult> {
  return cached("top-sku", p, async () => {
    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          ...storeScope(p.orgId, p.storeId),
          createdAt: { gte: p.from, lte: p.to },
          status: { in: [...REVENUE_STATUSES] },
        },
      },
      select: {
        quantity: true,
        unitPrice: true,
        discount: true,
        variant: { select: { sku: true, product: { select: { name: true } } } },
      },
    });
    const bySku = new Map<string, { sku: string; name: string; revenue: bigint; qty: number }>();
    for (const it of items) {
      const line = it.unitPrice * BigInt(it.quantity) - it.discount;
      const cur = bySku.get(it.variant.sku) ?? { sku: it.variant.sku, name: it.variant.product.name, revenue: 0n, qty: 0 };
      cur.revenue += line;
      cur.qty += it.quantity;
      bySku.set(it.variant.sku, cur);
    }
    const rows = [...bySku.values()].sort((a, b) => Number(b.revenue - a.revenue)).slice(0, 50)
      .map((r) => [r.sku, r.name, Number(r.revenue), r.qty]);
    return {
      columns: ["SKU", "Sản phẩm", "Doanh thu (đ)", "Số lượng"],
      rows,
    };
  });
}

export async function stockOnHand(p: ReportParams): Promise<ReportResult> {
  return cached("stock-on-hand", p, async () => {
    // Rewrite per audit 2026-08-30 DATA-002: the old select referenced
    // `quantity` and `variant.price` — neither column exists — so this report
    // threw a Prisma validation error on every call. Value now uses the
    // current retail price row.
    const now = new Date();
    const balances = await prisma.inventoryBalance.findMany({
      where: {
        ...(p.storeId ? { location: { storeId: p.storeId } } : { location: { store: { region: { orgId: p.orgId } } } }),
      },
      select: {
        onHand: true,
        location: { select: { name: true, store: { select: { name: true, code: true } } } },
        variant: {
          select: {
            sku: true,
            product: { select: { name: true } },
            prices: {
              where: { priceList: { kind: "retail" }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
              orderBy: { validFrom: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    type Row = { sku: string; name: string; store: string; loc: string; qty: number; value: bigint };
    const map = new Map<string, Row>();
    for (const b of balances) {
      const key = `${b.variant.sku}::${b.location.store?.code ?? "_"}::${b.location.name}`;
      const cur = map.get(key) ?? {
        sku: b.variant.sku, name: b.variant.product.name,
        store: b.location.store?.name ?? "—", loc: b.location.name,
        qty: 0, value: 0n,
      };
      cur.qty += b.onHand;
      cur.value += (b.variant.prices[0]?.amount ?? 0n) * BigInt(b.onHand);
      map.set(key, cur);
    }
    const rows = [...map.values()].sort((a, b) => Number(b.value - a.value))
      .map((r) => [r.sku, r.name, r.store, r.loc, r.qty, Number(r.value)]);
    const totalValue = balances.reduce((s, b) => s + (b.variant.prices[0]?.amount ?? 0n) * BigInt(b.onHand), 0n);
    return {
      columns: ["SKU", "Sản phẩm", "Cửa hàng", "Vị trí", "Tồn", "Giá trị (đ)"],
      rows,
      summary: { totalValue: Number(totalValue), totalRows: balances.length },
    };
  });
}

export const reportTypes = {
  "revenue-by-store": revenueByStore,
  "revenue-by-category": revenueByCategory,
  "top-sku": topSku,
  "stock-on-hand": stockOnHand,
} as const;

export type ReportType = keyof typeof reportTypes;

export async function invalidateOrgReports(orgId: string) {
  await cacheFlush(`reports:${orgId}:*`);
}

export function toCsv(result: ReportResult): string {
  const lines = [result.columns, ...result.rows].map((cells) => cells.map(csvEscape).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
