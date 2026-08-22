import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

// GET /api/analytics — Phase 2 operational and financial metrics from live records.
export async function GET() {
  try {
    await requirePermission("reports.financial.view");
    const start = new Date();
    start.setMonth(start.getMonth() - 1);
    const [orders, returns, returnTotal, giftCardLiability, countAdjustments, orderChannels] = await Promise.all([
      prisma.order.groupBy({ by: ["status"], _count: true, _sum: { total: true }, where: { createdAt: { gte: start } } }),
      prisma.return.groupBy({ by: ["status"], _count: true, where: { createdAt: { gte: start } } }),
      prisma.return.aggregate({ _sum: { refundTotal: true }, where: { status: "REFUNDED", createdAt: { gte: start } } }),
      prisma.giftCard.aggregate({ _sum: { balance: true }, where: { active: true } }),
      prisma.inventoryMovement.aggregate({ _sum: { quantity: true }, _count: true, where: { type: "STOCK_ADJUSTMENT", createdAt: { gte: start } } }),
      prisma.order.groupBy({ by: ["channel"], _count: true, _sum: { total: true }, where: { createdAt: { gte: start } } }),
    ]);
    return ok({
      periodStart: start,
      orders: orders.map((row) => ({ status: row.status, count: row._count, revenue: Number(row._sum.total ?? 0n) })),
      orderChannels: orderChannels.map((row) => ({ channel: row.channel, count: row._count, revenue: Number(row._sum.total ?? 0n) })),
      returns: returns.map((row) => ({ status: row.status, count: row._count })),
      refunded: Number(returnTotal._sum.refundTotal ?? 0n),
      giftCardLiability: Number(giftCardLiability._sum.balance ?? 0n),
      inventoryAdjustments: { movements: countAdjustments._count, quantity: countAdjustments._sum.quantity ?? 0 },
    });
  } catch (err) {
    return apiError(err);
  }
}
