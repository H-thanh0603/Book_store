import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

// GET /api/dashboard — all metrics computed from real transactions (spec §114 Flow 8)
export async function GET() {
  try {
    const auth = await requirePermission("reports.store.view");
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const [todayAgg, monthAgg, orderCount, customerCount, lowStock, topProducts, recentTxns] =
      await Promise.all([
        prisma.posTransaction.aggregate({
          where: { status: "COMPLETED", createdAt: { gte: startOfDay } },
          _sum: { total: true }, _count: true,
        }),
        prisma.posTransaction.aggregate({
          where: { status: "COMPLETED", createdAt: { gte: startOfMonth } },
          _sum: { total: true }, _count: true,
        }),
        prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
        prisma.customer.count(),
        // low stock: available <= 5 at any store location
        prisma.$queryRaw<{ sku: string; name: string; loc: string; available: number }[]>`
          SELECT v.sku, p.name, l.name AS loc, (b."onHand" - b.reserved) AS available
          FROM "InventoryBalance" b
          JOIN "ProductVariant" v ON v.id = b."variantId"
          JOIN "Product" p ON p.id = v."productId"
          JOIN "StockLocation" l ON l.id = b."locationId"
          WHERE l."storeId" IS NOT NULL AND (b."onHand" - b.reserved) <= 5
          ORDER BY (b."onHand" - b.reserved) ASC LIMIT 20`,
        // top products MTD by revenue
        prisma.$queryRaw<{ name: string; units: number; revenue: string }[]>`
          SELECT p.name, SUM(i.quantity) AS units, SUM(i.quantity * i."unitPrice")::text AS revenue
          FROM "PosTransactionItem" i
          JOIN "PosTransaction" t ON t.id = i."txId"
          JOIN "ProductVariant" v ON v.id = i."variantId"
          JOIN "Product" p ON p.id = v."productId"
          WHERE t.status = 'COMPLETED' AND t."createdAt" >= ${startOfMonth}
          GROUP BY p.name ORDER BY SUM(i.quantity * i."unitPrice") DESC LIMIT 10`,
        prisma.posTransaction.findMany({
          take: 10, orderBy: { createdAt: "desc" },
          include: { shift: { include: { terminal: { include: { store: true } } } } },
        }),
      ]);

    return ok({
      today: { revenue: Number(todayAgg._sum.total ?? 0n), transactions: todayAgg._count },
      month: { revenue: Number(monthAgg._sum.total ?? 0n), transactions: monthAgg._count },
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
