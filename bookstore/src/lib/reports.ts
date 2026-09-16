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
import { Prisma } from "../generated/prisma/client";

// "COMPLETED" is a PosTransaction status, not an OrderStatus — Order revenue
// states are CONFIRMED/PAID/SHIPPED/DELIVERED — spelled out in the raw SQL
// below (Postgres IN lists can't bind arrays as one parameter).

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
    // SQL GROUP BY rewrite (was: load every order in the window into JS and
    // reduce — a year of traffic meant hundreds of thousands of rows over
    // the wire to compute ~5 sums). SUM over bigint comes back as numeric;
    // ::bigint keeps the BigInt money contract for the JS layer.
    const rows = await prisma.$queryRaw<{ name: string; code: string; revenue: bigint; orders: bigint }[]>`
      SELECT s.name, s.code,
             COALESCE(SUM(o.total), 0)::bigint AS revenue,
             COUNT(o.id)::bigint AS orders
      FROM "Store" s
      LEFT JOIN "Order" o
        ON o."storeId" = s.id
       AND o."createdAt" >= ${p.from} AND o."createdAt" <= ${p.to}
       AND o.status IN ('CONFIRMED','PAID','SHIPPED','DELIVERED')
      WHERE s.id = ANY(
        SELECT st.id FROM "Store" st
        JOIN "Region" r ON r.id = st."regionId"
        WHERE r."orgId" = ${p.orgId} ${p.storeId ? Prisma.sql`AND st.id = ${p.storeId}` : Prisma.empty}
      )
      GROUP BY s.id, s.name, s.code
      ORDER BY revenue DESC`;
    const total = rows.reduce((s, r) => s + r.revenue, 0n);
    const totalOrders = rows.reduce((s, r) => s + r.orders, 0n);
    return {
      columns: ["Cửa hàng", "Mã", "Doanh thu (đ)", "Số đơn"],
      rows: rows.map((r) => [r.name, r.code, Number(r.revenue), Number(r.orders)]),
      summary: { totalRevenue: Number(total), totalOrders: Number(totalOrders) },
    };
  });
}

export async function revenueByCategory(p: ReportParams): Promise<ReportResult> {
  return cached("revenue-by-category", p, async () => {
    // SQL GROUP BY rewrite — same shape as revenueByStore: aggregate in the
    // database, ship ~category-count rows instead of every order item.
    const rows = await prisma.$queryRaw<{ category: string; revenue: bigint; qty: bigint }[]>`
      SELECT c.name AS category,
             SUM(oi."unitPrice" * oi.quantity - oi.discount)::bigint AS revenue,
             SUM(oi.quantity)::bigint AS qty
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Store" s ON s.id = o."storeId"
      JOIN "Region" rg ON rg.id = s."regionId"
      JOIN "ProductVariant" v ON v.id = oi."variantId"
      JOIN "Product" pr ON pr.id = v."productId"
      LEFT JOIN "Category" c ON c.id = pr."categoryId"
      WHERE rg."orgId" = ${p.orgId}
        ${p.storeId ? Prisma.sql`AND s.id = ${p.storeId}` : Prisma.empty}
        AND o."createdAt" >= ${p.from} AND o."createdAt" <= ${p.to}
        AND o.status IN ('CONFIRMED','PAID','SHIPPED','DELIVERED')
      GROUP BY c.name
      ORDER BY revenue DESC`;
    const total = rows.reduce((s, r) => s + r.revenue, 0n);
    const totalQty = rows.reduce((s, r) => s + r.qty, 0n);
    return {
      columns: ["Danh mục", "Doanh thu (đ)", "Số lượng"],
      rows: rows.map((r) => [r.category ?? "(chưa phân loại)", Number(r.revenue), Number(r.qty)]),
      summary: { totalRevenue: Number(total), totalQuantity: Number(totalQty) },
    };
  });
}

export async function topSku(p: ReportParams): Promise<ReportResult> {
  return cached("top-sku", p, async () => {
    // SQL GROUP BY rewrite with LIMIT 50 pushed into the query — the JS
    // version shipped every order item in the window to sort in memory.
    const rows = await prisma.$queryRaw<{ sku: string; name: string; revenue: bigint; qty: bigint }[]>`
      SELECT v.sku, pr.name,
             SUM(oi."unitPrice" * oi.quantity - oi.discount)::bigint AS revenue,
             SUM(oi.quantity)::bigint AS qty
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Store" s ON s.id = o."storeId"
      JOIN "Region" rg ON rg.id = s."regionId"
      JOIN "ProductVariant" v ON v.id = oi."variantId"
      JOIN "Product" pr ON pr.id = v."productId"
      WHERE rg."orgId" = ${p.orgId}
        ${p.storeId ? Prisma.sql`AND s.id = ${p.storeId}` : Prisma.empty}
        AND o."createdAt" >= ${p.from} AND o."createdAt" <= ${p.to}
        AND o.status IN ('CONFIRMED','PAID','SHIPPED','DELIVERED')
      GROUP BY v.sku, pr.name
      ORDER BY revenue DESC
      LIMIT 50`;
    return {
      columns: ["SKU", "Sản phẩm", "Doanh thu (đ)", "Số lượng"],
      rows: rows.map((r) => [r.sku, r.name, Number(r.revenue), Number(r.qty)]),
    };
  });
}

export async function stockOnHand(p: ReportParams): Promise<ReportResult> {
  return cached("stock-on-hand", p, async () => {
    // Rewrite per audit 2026-08-30 DATA-002: the old select referenced
    // `quantity` and `variant.price` — neither column exists — so this report
    // threw a Prisma validation error on every call. Value now uses the
    // current retail price row.
    // P2-1: the Prisma findMany + JS group-by loaded every balance plus a
    // per-variant price subquery. GROUP BY + LATERAL price in SQL instead.
    const now = new Date();
    const rows = await prisma.$queryRaw<{
      sku: string; name: string; store: string; loc: string; qty: number; value: bigint;
    }[]>`
      SELECT v.sku, pr.name, s.name AS store, l.name AS loc,
             SUM(b."onHand")::int AS qty,
             SUM(b."onHand" * COALESCE(p.amount, 0))::bigint AS value
      FROM "InventoryBalance" b
      JOIN "ProductVariant" v ON v.id = b."variantId"
      JOIN "Product" pr ON pr.id = v."productId"
      JOIN "StockLocation" l ON l.id = b."locationId"
      LEFT JOIN "Store" s ON s.id = l."storeId"
      LEFT JOIN "Region" rg ON rg.id = s."regionId"
      LEFT JOIN LATERAL (
        SELECT pl.amount FROM "Price" pl
        JOIN "PriceList" k ON k.id = pl."priceListId"
        WHERE pl."variantId" = v.id AND k.kind = 'retail'
          AND pl."validFrom" <= ${now}
          AND (pl."validTo" IS NULL OR pl."validTo" > ${now})
        ORDER BY pl."validFrom" DESC LIMIT 1
      ) p ON true
      WHERE rg."orgId" = ${p.orgId} OR (l."storeId" IS NULL AND v."orgId" = ${p.orgId})
        ${p.storeId ? Prisma.sql`AND s.id = ${p.storeId}` : Prisma.empty}
      GROUP BY v.sku, pr.name, s.name, l.name
      ORDER BY value DESC`;
    const totalValue = rows.reduce((s, r) => s + r.value, 0n);
    return {
      columns: ["SKU", "Sản phẩm", "Cửa hàng", "Vị trí", "Tồn", "Giá trị (đ)"],
      rows: rows.map((r) => [r.sku, r.name, r.store ?? "—", r.loc, r.qty, Number(r.value)]),
      summary: { totalValue: Number(totalValue), totalRows: rows.length },
    };
  });
}

export const reportTypes = {
  "revenue-by-store": revenueByStore,
  "revenue-by-category": revenueByCategory,
  "top-sku": topSku,
  "stock-on-hand": stockOnHand,
  "store-pnl": storePnl,
  "top-staff": topStaff,
  "slow-stock": slowStock,
} as const;

export type ReportType = keyof typeof reportTypes;

export async function invalidateOrgReports(orgId: string) {
  await cacheFlush(`reports:${orgId}:*`);
}

// N5a: P&L per store — revenue, discount, shipping fees, COGS estimate and
// gross profit. COGS uses each variant's LATEST purchase-order unitCost
// (DISTINCT ON); variants never purchased contribute 0 cost and are honest
// about it in the summary (unpricedQty). All math stays in SQL GROUP BY.
export async function storePnl(p: ReportParams): Promise<ReportResult> {
  return cached("store-pnl", p, async () => {
    const rows = await prisma.$queryRaw<{
      name: string; code: string; revenue: bigint; discount: bigint;
      shipping: bigint; orders: bigint; cogs: bigint; unpricedQty: bigint;
    }[]>`
      WITH latest_cost AS (
        SELECT DISTINCT ON (poi."variantId") poi."variantId", poi."unitCost" AS cost
        FROM "PurchaseOrderItem" poi
        JOIN "PurchaseOrder" po ON po.id = poi."poId"
        JOIN "Supplier" sup ON sup.id = po."supplierId"
        WHERE sup."orgId" = ${p.orgId}
        ORDER BY poi."variantId", po."createdAt" DESC
      )
      SELECT s.name, s.code,
             COALESCE(SUM(o.total), 0)::bigint AS revenue,
             COALESCE(SUM(o."discountTotal"), 0)::bigint AS discount,
             COALESCE(SUM(o."shippingFee"), 0)::bigint AS shipping,
             COUNT(o.id)::bigint AS orders,
             COALESCE(SUM(oi.quantity * COALESCE(lc.cost, 0)), 0)::bigint AS cogs,
             COALESCE(SUM(CASE WHEN lc.cost IS NULL THEN oi.quantity ELSE 0 END), 0)::bigint AS "unpricedQty"
      FROM "Store" s
      LEFT JOIN "Order" o
        ON o."storeId" = s.id
       AND o."createdAt" >= ${p.from} AND o."createdAt" <= ${p.to}
       AND o.status IN ('CONFIRMED','PAID','SHIPPED','DELIVERED')
      LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
      LEFT JOIN latest_cost lc ON lc."variantId" = oi."variantId"
      WHERE s.id = ANY(
        SELECT st.id FROM "Store" st
        JOIN "Region" r ON r.id = st."regionId"
        WHERE r."orgId" = ${p.orgId} ${p.storeId ? Prisma.sql`AND st.id = ${p.storeId}` : Prisma.empty}
      )
      GROUP BY s.id, s.name, s.code
      ORDER BY revenue DESC`;
    const sum = (f: (r: (typeof rows)[number]) => bigint) => rows.reduce((s, r) => s + f(r), 0n);
    const revenue = sum((r) => r.revenue);
    const cogs = sum((r) => r.cogs);
    return {
      columns: ["Cửa hàng", "Mã", "Doanh thu (đ)", "Giảm giá (đ)", "Phí ship (đ)", "Giá vốn ước tính (đ)", "Lợi nhuận gộp (đ)", "Số đơn"],
      rows: rows.map((r) => [
        r.name, r.code, Number(r.revenue), Number(r.discount),
        Number(r.shipping), Number(r.cogs), Number(r.revenue - r.cogs),
        Number(r.orders),
      ]),
      summary: {
        totalRevenue: Number(revenue),
        totalCogs: Number(cogs),
        grossProfit: Number(revenue - cogs),
        unpricedQty: Number(sum((r) => r.unpricedQty)),
      },
    };
  });
}

// N5b: top sales staff — COMPLETED POS transactions grouped by the shift's
// cashier (PosTransaction itself carries no cashier — join via PosShift).
export async function topStaff(p: ReportParams): Promise<ReportResult> {
  return cached("top-staff", p, async () => {
    const rows = await prisma.$queryRaw<{ name: string; email: string; revenue: bigint; txns: bigint }[]>`
      SELECT COALESCE(u.email, sh."cashierId") AS name,
             COALESCE(u.email, '') AS email,
             COALESCE(SUM(t.total), 0)::bigint AS revenue,
             COUNT(t.id)::bigint AS txns
      FROM "PosTransaction" t
      JOIN "PosShift" sh ON sh.id = t."shiftId"
      JOIN "Store" s ON s.id = t."storeId"
      JOIN "Region" rg ON rg.id = s."regionId"
      LEFT JOIN "User" u ON u.id = sh."cashierId"
      WHERE rg."orgId" = ${p.orgId}
        ${p.storeId ? Prisma.sql`AND s.id = ${p.storeId}` : Prisma.empty}
        AND t."createdAt" >= ${p.from} AND t."createdAt" <= ${p.to}
        AND t.status = 'COMPLETED'
      GROUP BY u.email, sh."cashierId"
      ORDER BY revenue DESC
      LIMIT 20`;
    return {
      columns: ["Nhân viên", "Doanh thu (đ)", "Số giao dịch"],
      rows: rows.map((r) => [r.name, Number(r.revenue), Number(r.txns)]),
    };
  });
}

// N5c: slow-moving stock — balances with onHand > 0 and no SALE movement in
// the last 60 days, valued at current retail price. Tells purchasing what to
// stop reordering and marketing what to promote.
export async function slowStock(p: ReportParams): Promise<ReportResult> {
  return cached("slow-stock", p, async () => {
    const cutoff = new Date(p.to.getTime() - 60 * 86_400_000);
    // P2-1: the cutoff used to filter in JS after fetching top-200 by stock —
    // true slow movers outside the top-200 were missed. Push the predicate
    // into SQL via NOT EXISTS so the LIMIT applies to actual slow stock.
    const rows = await prisma.$queryRaw<{
      sku: string; name: string; store: string; qty: number;
      price: bigint; lastSale: Date | null; value: bigint;
    }[]>`
      SELECT v.sku, pr.name, s.name AS store,
             b."onHand"::int AS qty,
             COALESCE((
               SELECT pl.amount FROM "Price" pl
               JOIN "PriceList" k ON k.id = pl."priceListId"
               WHERE pl."variantId" = v.id AND k.kind = 'retail'
                 AND pl."validFrom" <= ${p.to}
                 AND (pl."validTo" IS NULL OR pl."validTo" > ${p.to})
               ORDER BY pl."validFrom" DESC LIMIT 1
             ), 0)::bigint AS price,
             (SELECT MAX(m."createdAt") FROM "InventoryMovement" m
               WHERE m."variantId" = v.id AND m."locationId" = b."locationId"
                 AND m.type = 'SALE') AS "lastSale",
             (b."onHand" * COALESCE((
               SELECT pl.amount FROM "Price" pl
               JOIN "PriceList" k ON k.id = pl."priceListId"
               WHERE pl."variantId" = v.id AND k.kind = 'retail'
                 AND pl."validFrom" <= ${p.to}
                 AND (pl."validTo" IS NULL OR pl."validTo" > ${p.to})
               ORDER BY pl."validFrom" DESC LIMIT 1
             ), 0))::bigint AS value
      FROM "InventoryBalance" b
      JOIN "ProductVariant" v ON v.id = b."variantId"
      JOIN "Product" pr ON pr.id = v."productId"
      JOIN "StockLocation" l ON l.id = b."locationId"
      JOIN "Store" s ON s.id = l."storeId"
      JOIN "Region" rg ON rg.id = s."regionId"
      WHERE rg."orgId" = ${p.orgId}
        ${p.storeId ? Prisma.sql`AND s.id = ${p.storeId}` : Prisma.empty}
        AND b."onHand" > 0 AND v.active
        AND NOT EXISTS (
          SELECT 1 FROM "InventoryMovement" m
          WHERE m."variantId" = v.id AND m."locationId" = b."locationId"
            AND m.type = 'SALE' AND m."createdAt" >= ${cutoff}
        )
      ORDER BY value DESC
      LIMIT 100`;
    const value = rows.reduce((s, r) => s + r.value, 0n);
    return {
      columns: ["SKU", "Sản phẩm", "Cửa hàng", "Tồn", "Giá bán (đ)", "Giá trị tồn (đ)", "Lần bán cuối"],
      rows: rows.map((r) => [
        r.sku, r.name, r.store, r.qty, Number(r.price), Number(r.value),
        r.lastSale ? r.lastSale.toISOString().slice(0, 10) : "chưa từng bán",
      ]),
      summary: { slowSkus: rows.length, slowValue: Number(value) },
    };
  });
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
