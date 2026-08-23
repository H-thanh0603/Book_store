import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission, resolveStoreScope } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { zonedStartOfDay, zonedStartOfMonth } from "@/lib/time";

// GET /api/dashboard — all metrics computed from real transactions (spec §114 Flow 8)
export async function GET() {
  try {
    const auth = await requirePermission("reports.store.view");
    // Store-scoped roles only see their own stores' numbers.
    const storeScope = resolveStoreScope(auth, undefined, "reports.store.view");
    // Business-day windows follow the store's timezone (APP_TIMEZONE), not host TZ.
    const startOfDay = zonedStartOfDay();
    const startOfMonth = zonedStartOfMonth();

    const transactionStoreFilter = storeScope
      ? Prisma.sql`AND t."storeId" IN (${Prisma.join(storeScope)})`
      : Prisma.empty;
    const locationStoreFilter = storeScope
      ? Prisma.sql`AND l."storeId" IN (${Prisma.join(storeScope)})`
      : Prisma.empty;

    const [todayAgg, monthAgg, orderCount, customerCount, lowStock, topProducts, recentTxns] =
      await Promise.all([
        prisma.$queryRaw<{ total: string; count: bigint }[]>`
          SELECT COALESCE(SUM(total),0)::text AS total, COUNT(*) AS count FROM "PosTransaction" t
          WHERE t.status = 'COMPLETED' AND t."createdAt" >= ${startOfDay} ${transactionStoreFilter}`,
        prisma.$queryRaw<{ total: string; count: bigint }[]>`
          SELECT COALESCE(SUM(total),0)::text AS total, COUNT(*) AS count FROM "PosTransaction" t
          WHERE t.status = 'COMPLETED' AND t."createdAt" >= ${startOfMonth} ${transactionStoreFilter}`,
        prisma.order.count({
          where: { createdAt: { gte: startOfMonth }, ...(storeScope ? { storeId: { in: storeScope } } : {}) },
        }),
        prisma.customer.count(),
        // low stock: available <= 5 at any store location
        prisma.$queryRaw<{ sku: string; name: string; loc: string; available: number }[]>`
          SELECT v.sku, p.name, l.name AS loc, (b."onHand" - b.reserved) AS available
          FROM "InventoryBalance" b
          JOIN "ProductVariant" v ON v.id = b."variantId"
          JOIN "Product" p ON p.id = v."productId"
          JOIN "StockLocation" l ON l.id = b."locationId"
          WHERE l."storeId" IS NOT NULL AND (b."onHand" - b.reserved) <= 5 ${locationStoreFilter}
          ORDER BY (b."onHand" - b.reserved) ASC LIMIT 20`,
        // top products MTD by revenue
        prisma.$queryRaw<{ name: string; units: number; revenue: string }[]>`
          SELECT p.name, SUM(i.quantity) AS units, SUM(i.quantity * i."unitPrice")::text AS revenue
          FROM "PosTransactionItem" i
          JOIN "PosTransaction" t ON t.id = i."txId"
          JOIN "ProductVariant" v ON v.id = i."variantId"
          JOIN "Product" p ON p.id = v."productId"
          WHERE t.status = 'COMPLETED' AND t."createdAt" >= ${startOfMonth} ${transactionStoreFilter}
          GROUP BY p.name ORDER BY SUM(i.quantity * i."unitPrice") DESC LIMIT 10`,
        prisma.posTransaction.findMany({
          where: storeScope ? { shift: { terminal: { storeId: { in: storeScope } } } } : undefined,
          take: 10, orderBy: { createdAt: "desc" },
          include: { shift: { include: { terminal: { include: { store: true } } } } },
        }),
      ]);

    return ok({
      today: { revenue: Number(todayAgg[0].total), transactions: Number(todayAgg[0].count) },
      month: { revenue: Number(monthAgg[0].total), transactions: Number(monthAgg[0].count) },
      ordersMTD: orderCount,
      customers: customerCount,
      lowStock,
      topProducts,
      recentTransactions: recentTxns.map((t) => ({
        number: t.number, total: Number(t.total), time: t.createdAt,
        store: t.shift.terminal.store.name,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
