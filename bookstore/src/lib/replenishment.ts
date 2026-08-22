import { prisma } from "./db";
import { getSystemConfig } from "./api";
import { calculateReplenishment } from "./replenishment-formula";

export async function generateReplenishmentSuggestions() {
  const [historyDays, safetyStock, leadTimeDays] = await Promise.all([
    getSystemConfig("replenishment.historyDays", 30),
    getSystemConfig("replenishment.safetyStock", 10),
    getSystemConfig("replenishment.defaultLeadTimeDays", 7),
  ]);
  const since = new Date(Date.now() - historyDays * 86_400_000);
  const [balances, sales] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: { location: { active: true }, variant: { active: true } },
      include: { variant: { include: { product: true } }, location: true },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["variantId", "locationId"], where: { type: "SALE", createdAt: { gte: since } }, _sum: { quantity: true },
    }),
  ]);
  const soldByBalance = new Map(sales.map((row) => [`${row.variantId}:${row.locationId}`, Math.max(0, -(row._sum.quantity ?? 0))]));

  await Promise.all(balances.map((balance) => {
    const soldUnits = soldByBalance.get(`${balance.variantId}:${balance.locationId}`) ?? 0;
    const availableQty = balance.onHand - balance.reserved;
    const forecast = calculateReplenishment({ soldUnits, historyDays, availableQty, incomingQty: balance.inTransit, safetyStock, leadTimeDays });
    const rationale = {
      historyDays, soldUnits, daysOfCover: forecast.daysOfCover,
      formula: "ceil(avgDailySales * leadTimeDays + safetyStock - available - incoming)",
    };
    return prisma.replenishmentSuggestion.upsert({
      where: { variantId_locationId: { variantId: balance.variantId, locationId: balance.locationId } },
      create: {
        variantId: balance.variantId, locationId: balance.locationId,
        averageDailySales: forecast.averageDailySales, availableQty, incomingQty: balance.inTransit,
        safetyStock, leadTimeDays, recommendedQty: forecast.recommendedQty, rationale,
      },
      update: {
        averageDailySales: forecast.averageDailySales, availableQty, incomingQty: balance.inTransit,
        safetyStock, leadTimeDays, recommendedQty: forecast.recommendedQty,
        status: "OPEN", rationale, generatedAt: new Date(),
      },
    });
  }));

  return prisma.replenishmentSuggestion.findMany({
    where: { recommendedQty: { gt: 0 } },
    include: { variant: { include: { product: true } }, location: true },
    orderBy: { recommendedQty: "desc" },
  });
}
