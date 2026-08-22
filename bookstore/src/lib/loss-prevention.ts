import { prisma } from "./db";
import { getSystemConfig } from "./api";

type AlertInput = {
  rule: string;
  severity: "MEDIUM" | "HIGH";
  entityType: string;
  entityId: string;
  message: string;
  evidence: Record<string, string | number | boolean | null>;
};

async function recordAlert(alert: AlertInput) {
  return prisma.lossAlert.upsert({
    where: { rule_entityType_entityId: { rule: alert.rule, entityType: alert.entityType, entityId: alert.entityId } },
    create: alert,
    update: { severity: alert.severity, message: alert.message, evidence: alert.evidence, detectedAt: new Date() },
  });
}

export async function scanLossPrevention() {
  const [maxRefund, maxDiscountPercent, maxCashVariance, maxStockLoss] = await Promise.all([
    getSystemConfig("loss.maxRefund", 500_000),
    getSystemConfig("loss.maxDiscountPercent", 30),
    getSystemConfig("loss.maxCashVariance", 100_000),
    getSystemConfig("loss.maxStockLoss", 10),
  ]);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [returns, transactions, shifts, losses, cancelledPaid] = await Promise.all([
    prisma.return.findMany({ where: { refundTotal: { gte: BigInt(maxRefund) }, createdAt: { gte: since } } }),
    prisma.posTransaction.findMany({ where: { subtotal: { gt: 0n }, createdAt: { gte: since } } }),
    prisma.posShift.findMany({ where: { status: "CLOSED", closedAt: { gte: since }, variance: { not: null } } }),
    prisma.inventoryMovement.findMany({
      where: { type: { in: ["LOST", "STOCK_ADJUSTMENT"] }, quantity: { lt: 0 }, createdAt: { gte: since } },
      include: { variant: true, location: true },
    }),
    prisma.posTransaction.findMany({ where: { status: "CANCELLED", createdAt: { gte: since }, payments: { some: {} } }, include: { payments: true } }),
  ]);

  const alerts: Promise<unknown>[] = [];
  for (const ret of returns) alerts.push(recordAlert({
    rule: "LARGE_REFUND", severity: "HIGH", entityType: "Return", entityId: ret.id,
    message: `Refund ${ret.number} exceeds review threshold`, evidence: { amount: Number(ret.refundTotal), threshold: maxRefund },
  }));
  for (const transaction of transactions) {
    const percent = Number(transaction.discountTotal * 100n / transaction.subtotal);
    if (percent >= maxDiscountPercent) alerts.push(recordAlert({
      rule: "EXCESSIVE_DISCOUNT", severity: "HIGH", entityType: "PosTransaction", entityId: transaction.id,
      message: `Transaction ${transaction.number} has ${percent}% discount`, evidence: { percent, threshold: maxDiscountPercent },
    }));
  }
  for (const shift of shifts) {
    const variance = Number(shift.variance ?? 0n);
    if (Math.abs(variance) >= maxCashVariance) alerts.push(recordAlert({
      rule: "CASH_VARIANCE", severity: "HIGH", entityType: "PosShift", entityId: shift.id,
      message: "Closed shift has unusual cash variance", evidence: { variance, threshold: maxCashVariance },
    }));
  }
  for (const loss of losses) if (Math.abs(loss.quantity) >= maxStockLoss) alerts.push(recordAlert({
    rule: "STOCK_SHRINKAGE", severity: "MEDIUM", entityType: "InventoryMovement", entityId: loss.id,
    message: `${loss.variant.sku} lost ${Math.abs(loss.quantity)} units at ${loss.location.name}`,
    evidence: { quantity: loss.quantity, threshold: maxStockLoss },
  }));
  for (const transaction of cancelledPaid) alerts.push(recordAlert({
    rule: "CANCELLED_AFTER_PAYMENT", severity: "HIGH", entityType: "PosTransaction", entityId: transaction.id,
    message: `Paid transaction ${transaction.number} was cancelled`,
    evidence: { paid: Number(transaction.payments.reduce((sum, payment) => sum + payment.amount, 0n)) },
  }));

  await Promise.all(alerts);
  return prisma.lossAlert.findMany({ where: { status: "OPEN" }, orderBy: { detectedAt: "desc" }, take: 100 });
}
