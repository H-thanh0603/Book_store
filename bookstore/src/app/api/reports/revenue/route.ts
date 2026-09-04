// Revenue reports API — daily/monthly revenue, top products, store comparison.
// Multi-tenant (audit 2026-08-30 SEC-008): every raw query joins Store→Region
// and filters on orgId from the auth context — a passed-in storeId alone is
// NOT trusted (it belongs to some org, not necessarily the caller's).
import { NextRequest } from "next/server";
import { prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { Prisma } from "@/generated/prisma/client";

// GET /api/reports/revenue?from=2026-08-01&to=2026-08-26&storeId=xxx&group=day|month
export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("reports.financial.view");
    if (!auth.orgId) return ok({ error: "VALIDATION", message: "caller has no org" }, 400);
    const orgId = auth.orgId;
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

    // Org scope fragment: Store→Region join + orgId match, applied even when
    // storeId is given (a foreign-org storeId must return zero rows).
    const orgJoin = Prisma.sql`JOIN "Store" s ON s.id = "PosTransaction"."storeId"
        JOIN "Region" r ON r.id = s."regionId" AND r."orgId" = ${orgId}`;
    const orgJoinAlias = Prisma.sql`JOIN "Store" s ON s.id = t."storeId"
        JOIN "Region" r ON r.id = s."regionId" AND r."orgId" = ${orgId}`;

    // Daily/Monthly revenue from POS transactions
    const dailyRevenue = await prismaRead.$queryRaw<
      { period: string; revenue: number; transactions: number; avgOrder: number }[]
    >`
      SELECT
        DATE_TRUNC(${trunc}, "PosTransaction"."createdAt")::text AS period,
        SUM("PosTransaction".total)::bigint AS revenue,
        COUNT(*)::int AS transactions,
        AVG("PosTransaction".total)::bigint AS "avgOrder"
      FROM "PosTransaction"
      ${orgJoin}
      WHERE "PosTransaction"."createdAt" >= ${from}
        AND "PosTransaction"."createdAt" <= ${to}
        AND "PosTransaction".status = 'COMPLETED'
        ${storeId ? Prisma.sql`AND "PosTransaction"."storeId" = ${storeId}` : Prisma.sql``}
      GROUP BY DATE_TRUNC(${trunc}, "PosTransaction"."createdAt")
      ORDER BY period ASC
    `;

    // Online orders revenue. Org attribution: store→region when the order
    // has a store, else the customer's orgId (storeId is nullable; delivery
    // orders without a store still belong to a tenant via their customer).
    const onlineRevenue = await prismaRead.$queryRaw<
      { period: string; revenue: number; orders: number }[]
    >`
      SELECT
        DATE_TRUNC(${trunc}, "Order"."createdAt")::text AS period,
        SUM("Order".total)::bigint AS revenue,
        COUNT(*)::int AS orders
      FROM "Order"
      JOIN "Customer" c ON c.id = "Order"."customerId"
      LEFT JOIN "Store" s ON s.id = "Order"."storeId"
      LEFT JOIN "Region" r ON r.id = s."regionId"
      WHERE "Order"."createdAt" >= ${from}
        AND "Order"."createdAt" <= ${to}
        AND "Order".status NOT IN ('CANCELLED')
        AND COALESCE(r."orgId", c."orgId") = ${orgId}
        ${storeId ? Prisma.sql`AND "Order"."storeId" = ${storeId}` : Prisma.sql``}
      GROUP BY DATE_TRUNC(${trunc}, "Order"."createdAt")
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
      ${orgJoinAlias}
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
          JOIN "Region" r ON r.id = s."regionId" AND r."orgId" = ${orgId}
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
