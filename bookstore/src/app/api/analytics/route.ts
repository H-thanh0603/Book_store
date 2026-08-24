import { prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { zonedMonthsAgo } from "@/lib/time";

// GET /api/analytics — Phase 2 operational and financial metrics from live records.
// Aggregate-only reads, seconds-stale-tolerant → read replica when configured.
export async function GET() {
  try {
    await requirePermission("reports.financial.view");
    // Calendar-safe one-month-ago boundary (no setMonth overflow on the 29th–31st).
    const start = zonedMonthsAgo(1);
    const [orders, returns, returnTotal, giftCardLiability, countAdjustments, orderChannels] = await Promise.all([
      prismaRead.order.groupBy({ by: ["status"], _count: true, _sum: { total: true }, where: { createdAt: { gte: start } } }),
      prismaRead.return.groupBy({ by: ["status"], _count: true, where: { createdAt: { gte: start } } }),
      prismaRead.return.aggregate({ _sum: { refundTotal: true }, where: { status: "REFUNDED", createdAt: { gte: start } } }),
      prismaRead.giftCard.aggregate({ _sum: { balance: true }, where: { active: true } }),
      prismaRead.inventoryMovement.aggregate({ _sum: { quantity: true }, _count: true, where: { type: "STOCK_ADJUSTMENT", createdAt: { gte: start } } }),
      prismaRead.order.groupBy({ by: ["channel"], _count: true, _sum: { total: true }, where: { createdAt: { gte: start } } }),
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
