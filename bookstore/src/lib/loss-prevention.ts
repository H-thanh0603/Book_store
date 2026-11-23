import { prisma } from "./db";
import { getSystemConfig } from "./api";
import { Prisma } from "../generated/prisma/client";

type AlertInput = {
  orgId: string;
  rule: string;
  severity: "MEDIUM" | "HIGH";
  entityType: string;
  entityId: string;
  message: string;
  evidence: Record<string, string | number | boolean | null>;
};

async function recordAlert(alert: AlertInput) {
  return prisma.lossAlert.upsert({
    where: {
      orgId_rule_entityType_entityId: {
        orgId: alert.orgId,
        rule: alert.rule,
        entityType: alert.entityType,
        entityId: alert.entityId,
      },
    },
    create: alert,
    update: { severity: alert.severity, message: alert.message, evidence: alert.evidence, detectedAt: new Date() },
  });
}

export type RuleKind = "LARGE_REFUND" | "EXCESSIVE_DISCOUNT" | "CASH_VARIANCE" | "STOCK_SHRINKAGE";

export const RULE_TO_CONFIG: Record<RuleKind, { key: string; defaultThreshold: number | bigint }> = {
  LARGE_REFUND: { key: "loss.maxRefund", defaultThreshold: 500_000 },
  EXCESSIVE_DISCOUNT: { key: "loss.maxDiscountPercent", defaultThreshold: 30 },
  CASH_VARIANCE: { key: "loss.maxCashVariance", defaultThreshold: 100_000 },
  STOCK_SHRINKAGE: { key: "loss.maxStockLoss", defaultThreshold: 10 },
};

/** Effective threshold for one rule, org-scoped, falls back to SystemConfig. */
export async function getRuleThreshold(orgId: string, kind: RuleKind): Promise<bigint> {
  const rule = await prisma.lossPreventionRule.findUnique({
    where: { orgId_kind: { orgId, kind } },
  });
  if (rule?.active) return BigInt(rule.threshold);
  const cfg = RULE_TO_CONFIG[kind];
  return BigInt(await getSystemConfig(cfg.key, cfg.defaultThreshold));
}

async function scanOrgLossPrevention(orgId: string) {
  const [maxRefund, maxDiscountPercent, maxCashVariance, maxStockLoss] = await Promise.all([
    getRuleThreshold(orgId, "LARGE_REFUND"),
    getRuleThreshold(orgId, "EXCESSIVE_DISCOUNT"),
    getRuleThreshold(orgId, "CASH_VARIANCE"),
    getRuleThreshold(orgId, "STOCK_SHRINKAGE"),
  ]);
  const since = new Date(Date.now() - 30 * 86_400_000);

  const discountOffenders = await prisma.$queryRaw<
    { id: string; number: string; percent: number }[]
  >(Prisma.sql`
    SELECT t.id, t.number,
           ROUND(t."discountTotal" * 100.0 / t.subtotal)::int AS percent
    FROM "PosTransaction" t
    JOIN "Store" s ON s.id = t."storeId"
    WHERE s."orgId" = ${orgId}
      AND t."subtotal" > 0
      AND t."discountTotal" * 100 >= t.subtotal * ${maxDiscountPercent}
      AND t."createdAt" >= ${since}
    LIMIT 200
  `);

  const stockLossThreshold = -Number(maxStockLoss);
  const [returns, shifts, losses, cancelledPaid] = await Promise.all([
    prisma.return.findMany({
      where: {
        refundTotal: { gte: maxRefund },
        createdAt: { gte: since },
        OR: [{ location: { store: { orgId } } }, { customer: { orgId } }],
      },
      orderBy: { refundTotal: "desc" },
      take: 200,
    }),
    prisma.$queryRaw<{ id: string }[]>`
      SELECT sh.id FROM "PosShift" sh
      JOIN "PosTerminal" term ON term.id = sh."terminalId"
      JOIN "Store" s ON s.id = term."storeId"
      WHERE s."orgId" = ${orgId}
        AND sh.status = 'CLOSED' AND sh."closedAt" >= ${since}
        AND sh.variance IS NOT NULL AND ABS(sh.variance) >= ${maxCashVariance}
      ORDER BY sh."closedAt" DESC LIMIT 200`,
    prisma.inventoryMovement.findMany({
      where: {
        type: { in: ["LOST", "STOCK_ADJUSTMENT"] },
        quantity: { lte: stockLossThreshold },
        createdAt: { gte: since },
        variant: { orgId },
      },
      include: { variant: { select: { sku: true } }, location: { select: { name: true } } },
      orderBy: { quantity: "asc" },
      take: 200,
    }),
    prisma.$queryRaw<{ id: string; number: string; paid: bigint }[]>`
      SELECT t.id, t.number, COALESCE(SUM(p.amount), 0)::bigint AS paid
      FROM "PosTransaction" t
      JOIN "Store" s ON s.id = t."storeId"
      JOIN "Payment" p ON p."txId" = t.id
      WHERE s."orgId" = ${orgId}
        AND t.status = 'CANCELLED' AND t."createdAt" >= ${since}
      GROUP BY t.id, t.number
      ORDER BY paid DESC LIMIT 200`,
  ]);

  const alerts: Promise<unknown>[] = [];
  for (const ret of returns) alerts.push(recordAlert({
    orgId, rule: "LARGE_REFUND", severity: "HIGH", entityType: "Return", entityId: ret.id,
    message: `Refund ${ret.number} exceeds review threshold`, evidence: { amount: Number(ret.refundTotal), threshold: Number(maxRefund) },
  }));
  for (const row of discountOffenders) alerts.push(recordAlert({
    orgId, rule: "EXCESSIVE_DISCOUNT", severity: "HIGH", entityType: "PosTransaction", entityId: row.id,
    message: `Transaction ${row.number} has ${row.percent}% discount`, evidence: { percent: row.percent, threshold: Number(maxDiscountPercent) },
  }));
  const shiftRows = shifts.length > 0
    ? await prisma.posShift.findMany({ where: { id: { in: shifts.map((s) => s.id) } } })
    : [];
  for (const shift of shiftRows) {
    const variance = Number(shift.variance ?? 0n);
    alerts.push(recordAlert({
      orgId, rule: "CASH_VARIANCE", severity: "HIGH", entityType: "PosShift", entityId: shift.id,
      message: "Closed shift has unusual cash variance", evidence: { variance, threshold: Number(maxCashVariance) },
    }));
  }
  for (const loss of losses) alerts.push(recordAlert({
    orgId, rule: "STOCK_SHRINKAGE", severity: "MEDIUM", entityType: "InventoryMovement", entityId: loss.id,
    message: `${loss.variant.sku} lost ${Math.abs(loss.quantity)} units at ${loss.location.name}`,
    evidence: { quantity: loss.quantity, threshold: Number(maxStockLoss) },
  }));
  for (const transaction of cancelledPaid) alerts.push(recordAlert({
    orgId, rule: "CANCELLED_AFTER_PAYMENT", severity: "HIGH", entityType: "PosTransaction", entityId: transaction.id,
    message: `Paid transaction ${transaction.number} was cancelled`,
    evidence: { paid: Number(transaction.paid) },
  }));

  await Promise.all(alerts);
  return prisma.lossAlert.findMany({
    where: { orgId, status: "OPEN" },
    orderBy: { detectedAt: "desc" },
    take: 100,
  });
}

export async function scanLossPrevention(targetOrgId?: string) {
  if (targetOrgId) return scanOrgLossPrevention(targetOrgId);
  const orgs = await prisma.organization.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL"] } },
    select: { id: true },
  });
  const all = [];
  for (const org of orgs) {
    const rows = await scanOrgLossPrevention(org.id);
    all.push(...rows);
  }
  return all;
}
