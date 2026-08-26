// Revenue reports API — daily/monthly revenue, top products, store comparison.
import { NextRequest } from "next/server";
import { prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { Prisma } from "@/generated/prisma/client";

// GET /api/reports/revenue?from=2026-08-01&to=2026-08-26&storeId=xxx&group=day|month
export async function GET(req: NextRequest) {
  try {
    await requirePermission("reports.financial.view");
    const sp = req.nextUrl.searchParams;
    const group = sp.get("group") === "month" ? "month" : "day";
    const storeId = sp.get("storeId") || undefined;

    // Default: current month
    const now = new Date();
    const fromStr = sp.get("from");
    const toStr = sp.get("to");
    const from = fromStr ? new Date(fromStr) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = toStr ? new Date(toStr + "T23:59:59") : now;

    // Build date truncation expression based on group
    const trunc = group === "month" ? "month" : "day";

    // Daily/Monthly revenue from POS transactions
    const dailyRevenue = await prismaRead.$queryRaw<
      { period: string; revenue: number; transactions: number; avgOrder: number }[]
    >`
      SELECT
        DATE_TRUNC(${trunc}, "createdAt")::text AS period,
        SUM(total)::bigint AS revenue,
        COUNT(*)::int AS transactions,
        AVG(total)::bigint AS "avgOrder"
      FROM "PosTransaction"
      WHERE "createdAt" >= ${from}
        AND "createdAt" <= ${to}
        AND status = 'COMPLETED'
        ${storeId ? Prisma.sql`AND "storeId" = ${storeId}` : Prisma.sql``}
      GROUP BY DATE_TRUNC(${trunc}, "createdAt")
      ORDER BY period ASC
    `;

    // Online orders revenue
    const onlineRevenue = await prismaRead.$queryRaw<
      { period: string; revenue: number; orders: number }[]
    >`
      SELECT
        DATE_TRUNC(${trunc}, "createdAt")::text AS period,
        SUM(total)::bigint AS revenue,
        COUNT(*)::int AS orders
      FROM "Order"
      WHERE "createdAt" >= ${from}
        AND "createdAt" <= ${to}
        AND status NOT IN ('CANCELLED')
        ${storeId ? Prisma.sql`AND "storeId" = ${storeId}` : Prisma.sql``}
      GROUP BY DATE_TRUNC(${trunc}, "createdAt")
      ORDER BY period ASC
    `;

    // Top 10 products by revenue
    const topProducts = await prismaRead.$queryRaw<
      { name: string; sku: string; revenue: number; quantity: number }[]
    >`
      SELECT
        p.name,
        v.sku,
        SUM(ti."unitPrice" * ti.quantity - ti.discount)::bigint AS revenue,
        SUM(ti.quantity)::int AS quantity
      FROM "PosTransactionItem" ti
      JOIN "PosTransaction" t ON t.id = ti."txId"
      JOIN "ProductVariant" v ON v.id = ti."variantId"
      JOIN "Product" p ON p.id = v."productId"
      WHERE t."createdAt" >= ${from}
        AND t."createdAt" <= ${to}
        AND t.status = 'COMPLETED'
        ${storeId ? Prisma.sql`AND t."storeId" = ${storeId}` : Prisma.sql``}
      GROUP BY p.name, v.sku
      ORDER BY revenue DESC
      LIMIT 10
    `;

    // Store comparison (if no storeId filter)
    let storeComparison: { name: string; code: string; revenue: number; transactions: number }[] = [];
    if (!storeId) {
      storeComparison = await prismaRead.$queryRaw`
        SELECT
          s.name,
          s.code,
          SUM(t.total)::bigint AS revenue,
          COUNT(*)::int AS transactions
        FROM "PosTransaction" t
        JOIN "Store" s ON s.id = t."storeId"
        WHERE t."createdAt" >= ${from}
          AND t."createdAt" <= ${to}
          AND t.status = 'COMPLETED'
        GROUP BY s.name, s.code
        ORDER BY revenue DESC
      `;
    }

    // Summary totals
    const totalPOS = dailyRevenue.reduce((s, r) => s + r.revenue, 0);
    const totalOnline = onlineRevenue.reduce((s, r) => s + r.revenue, 0);
    const totalTx = dailyRevenue.reduce((s, r) => s + r.transactions, 0);

    return ok({
      period: { from, to, group },
      summary: {
        totalRevenue: totalPOS + totalOnline,
        posRevenue: totalPOS,
        onlineRevenue: totalOnline,
        totalTransactions: totalTx,
        avgOrderValue: totalTx > 0 ? Math.round(totalPOS / totalTx) : 0,
      },
      dailyRevenue: dailyRevenue.map((r) => ({
        date: r.period,
        revenue: Number(r.revenue),
        transactions: r.transactions,
        avgOrder: Number(r.avgOrder),
      })),
      onlineRevenue: onlineRevenue.map((r) => ({
        date: r.period,
        revenue: Number(r.revenue),
        orders: r.orders,
      })),
      topProducts: topProducts.map((r) => ({
        name: r.name,
        sku: r.sku,
        revenue: Number(r.revenue),
        quantity: r.quantity,
      })),
      storeComparison: storeComparison.map((r) => ({
        name: r.name,
        code: r.code,
        revenue: Number(r.revenue),
        transactions: r.transactions,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
