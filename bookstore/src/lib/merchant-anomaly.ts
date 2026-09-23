// Merchant anomaly scan + why-funnel: proactive business monitoring.
// The merchant agent shouldn't wait to be asked — this module computes:
//   1. scanAnomalies: today vs 14-day baseline (revenue/orders), plus
//      stockout-risk, slow movers, pending approvals — each an Action.
//   2. whyRevenueChanged: revenue → orders → top-SKU → stockout funnel so
//      "doanh thu giảm vì sao" answers with evidence, not vibes.
// All reads org-scoped via ToolScope. Numbers only — narration is the LLM's job.
import { prisma } from "./db";
import { Prisma } from "../generated/prisma/client";
import type { ToolScope } from "./merchant-agent";

export type Anomaly = {
  kind: "revenue_drop" | "orders_drop" | "stockout_risk" | "slow_movers" | "pending_approvals" | "back_in_stock_demand";
  severity: "urgent" | "warning" | "info";
  title: string;
  detail: string;
  evidence: Record<string, number | string>;
};

type DayRow = { day: string; revenue: bigint; orders: number };

async function dailySeries(orgId: string | null, days: number): Promise<DayRow[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const orgFilter = orgId
    ? Prisma.sql`AND (s."orgId" = ${orgId} OR c."orgId" = ${orgId})`
    : Prisma.empty;
  return prisma.$queryRaw<DayRow[]>`
    SELECT DATE(o."createdAt") AS day,
           COALESCE(SUM(o.total), 0)::bigint AS revenue,
           COUNT(*)::int AS orders
    FROM "Order" o
    LEFT JOIN "Store" s ON s.id = o."storeId"
    LEFT JOIN "Customer" c ON c.id = o."customerId"
    WHERE o."createdAt" >= ${since} AND o.status NOT IN ('CANCELLED') ${orgFilter}
    GROUP BY DATE(o."createdAt")
    ORDER BY day ASC`;
}

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((s, n) => s + n, 0) / nums.length;
}

/** Pure funnel math (unit-tested): pct change, 0-safe. */
export function pctChange(today: number, baseline: number): number | null {
  if (baseline <= 0) return today > 0 ? 100 : null;
  return Math.round(((today - baseline) / baseline) * 100);
}

export async function scanAnomalies(scope: ToolScope): Promise<Anomaly[]> {
  const orgId = scope.orgId;
  const out: Anomaly[] = [];
  const series = await dailySeries(orgId, 15);
  if (series.length >= 8) {
    const base = series.slice(0, -1);
    const today = series[series.length - 1];
    const baseRev = avg(base.map((r) => Number(r.revenue)));
    const baseOrd = avg(base.map((r) => r.orders));
    const revDrop = pctChange(Number(today.revenue), baseRev);
    const ordDrop = pctChange(today.orders, baseOrd);
    if (revDrop !== null && revDrop <= -25 && Number(today.revenue) > 0) {
      out.push({
        kind: "revenue_drop", severity: "urgent",
        title: `Doanh thu hôm nay giảm ${-revDrop}% so với trung bình 14 ngày`,
        detail: "Mở Why-analysis để xem funnel revenue → orders → SKU.",
        evidence: { todayRevenue: Number(today.revenue), baselineRevenue: Math.round(baseRev), pct: revDrop },
      });
    }
    if (ordDrop !== null && ordDrop <= -30 && today.orders > 0) {
      out.push({
        kind: "orders_drop", severity: "warning",
        title: `Số đơn hôm nay giảm ${-ordDrop}% so với trung bình 14 ngày`,
        detail: "Kiểm tra traffic, payment gateway, campaign vừa kết thúc.",
        evidence: { todayOrders: today.orders, baselineOrders: Math.round(baseOrd), pct: ordDrop },
      });
    }
  }

  // Stockout risk: top sellers by 14d revenue with ≤7 days of cover.
  const since = new Date(Date.now() - 14 * 86_400_000);
  const orgStores = orgId ? { orgId } : {};
  const [balances, sales] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: { variant: orgStores, location: { active: true } },
      select: { variantId: true, onHand: true, reserved: true, variant: { select: { sku: true, product: { select: { name: true } } } } },
      take: 2000,
    }),
    prisma.inventoryMovement.groupBy({
      by: ["variantId"],
      where: { type: "SALE", createdAt: { gte: since }, variant: orgStores },
      _sum: { quantity: true },
    }),
  ]);
  const sold = new Map(sales.map((s) => [s.variantId, Math.max(0, -(s._sum.quantity ?? 0)) / 14]));
  const byVariant = new Map<string, { sku: string; name: string; avail: number }>();
  for (const b of balances) {
    const cur = byVariant.get(b.variantId) ?? { sku: b.variant.sku, name: b.variant.product.name, avail: 0 };
    cur.avail += b.onHand - b.reserved;
    byVariant.set(b.variantId, cur);
  }
  const atRisk = [...byVariant.entries()]
    .map(([variantId, v]) => ({ variantId, ...v, daily: sold.get(variantId) ?? 0 }))
    .filter((v) => v.daily > 0 && v.avail >= 0 && v.avail / v.daily <= 7)
    .sort((a, b) => a.avail / Math.max(a.daily, 0.01) - b.avail / Math.max(b.daily, 0.01))
    .slice(0, 8);
  if (atRisk.length > 0) {
    const worst = atRisk[0];
    out.push({
      kind: "stockout_risk", severity: "urgent",
      title: `${atRisk.length} SKU có nguy cơ hết hàng trong 7 ngày`,
      detail: `Nặng nhất: ${worst.name} — còn ${worst.avail}, bán ${worst.daily.toFixed(1)}/ngày.`,
      evidence: { count: atRisk.length, worstAvail: worst.avail, worstDaily: Math.round(worst.daily * 10) / 10 },
    });
  }

  // Pending human queue depth.
  const [staged, poPending] = await Promise.all([
    prisma.stagedChange.count({ where: { orgId: orgId ?? undefined, status: "PENDING" } }).catch(() => 0),
    prisma.purchaseOrder.count({ where: { status: "pending_approval", supplier: orgStores } }),
  ]);
  if (staged + poPending > 0) {
    out.push({
      kind: "pending_approvals", severity: "info",
      title: `${staged + poPending} mục chờ duyệt`,
      detail: "Duyệt trong Action Center để giải phóng tồn/PO.",
      evidence: { staged, purchaseOrders: poPending },
    });
  }
  return out;
}

export type WhyFunnel = {
  periodDays: number;
  revenue: { current: number; baseline: number; pct: number | null };
  orders: { current: number; baseline: number; pct: number | null };
  topDecliners: { variantId: string; sku: string; name: string; soldNow: number; soldBase: number; outOfStockDays: number }[];
  hypothesis: string;
};

/** Revenue → orders → SKU funnel over two windows (current vs previous N days). */
export async function whyRevenueChanged(scope: ToolScope, periodDays = 7): Promise<WhyFunnel> {
  const orgId = scope.orgId;
  const orgStores = orgId ? { orgId } : {};
  const now = new Date();
  const cur0 = new Date(now.getTime() - periodDays * 86_400_000);
  const base0 = new Date(now.getTime() - periodDays * 2 * 86_400_000);
  const [curOrders, baseOrders] = await Promise.all([
    prisma.order.aggregate({
      where: { createdAt: { gte: cur0 }, status: { notIn: ["CANCELLED"] }, ...(orgId ? { OR: [{ store: { orgId } }, { customer: { orgId } }] } : {}) },
      _sum: { total: true }, _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { createdAt: { gte: base0, lt: cur0 }, status: { notIn: ["CANCELLED"] }, ...(orgId ? { OR: [{ store: { orgId } }, { customer: { orgId } }] } : {}) },
      _sum: { total: true }, _count: { _all: true },
    }),
  ]);
  const curRev = Number(curOrders._sum.total ?? 0n);
  const baseRev = Number(baseOrders._sum.total ?? 0n);
  const curCnt = curOrders._count._all;
  const baseCnt = baseOrders._count._all;

  // SKU movers: sold qty per variant in both windows.
  const [curSales, baseSales] = await Promise.all([
    prisma.inventoryMovement.groupBy({
      by: ["variantId"], where: { type: "SALE", createdAt: { gte: cur0 }, variant: orgStores }, _sum: { quantity: true },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["variantId"], where: { type: "SALE", createdAt: { gte: base0, lt: cur0 }, variant: orgStores }, _sum: { quantity: true },
    }),
  ]);
  const curMap = new Map(curSales.map((s) => [s.variantId, Math.max(0, -(s._sum.quantity ?? 0))]));
  const baseMap = new Map(baseSales.map((s) => [s.variantId, Math.max(0, -(s._sum.quantity ?? 0))]));
  const decliners = [...baseMap.entries()]
    .map(([variantId, soldBase]) => ({ variantId, soldBase, soldNow: curMap.get(variantId) ?? 0 }))
    .filter((d) => d.soldBase >= 3 && d.soldNow < d.soldBase)
    .sort((a, b) => (b.soldBase - b.soldNow) - (a.soldBase - a.soldNow))
    .slice(0, 5);
  const variants = decliners.length > 0
    ? await prisma.productVariant.findMany({
        where: { id: { in: decliners.map((d) => d.variantId) } },
        select: { id: true, sku: true, product: { select: { name: true } }, balances: { select: { onHand: true, reserved: true } } },
      })
    : [];
  const byVar = new Map(variants.map((v) => [v.id, v]));
  const topDecliners = decliners.map((d) => {
    const v = byVar.get(d.variantId);
    const avail = v ? v.balances.reduce((s, b) => s + b.onHand - b.reserved, 0) : 0;
    return {
      variantId: d.variantId, sku: v?.sku ?? "?", name: v?.product.name ?? "?",
      soldNow: d.soldNow, soldBase: d.soldBase,
      outOfStockDays: avail <= 0 ? periodDays : 0,
    };
  });

  const revPct = pctChange(curRev, baseRev);
  const stockout = topDecliners.find((d) => d.outOfStockDays > 0);
  const hypothesis = revPct === null || revPct >= 0
    ? "Doanh thu không giảm trong kỳ — funnel dùng để xác nhận, không phải chẩn đoán."
    : stockout
      ? `Nguyên nhân khả dĩ: ${stockout.name} hết hàng (bán ${stockout.soldBase} → ${stockout.soldNow}). Kiểm tra tồn và tạo PO.`
      : topDecliners.length > 0
        ? `Nguyên nhân khả dĩ: ${topDecliners[0].name} giảm ${topDecliners[0].soldBase} → ${topDecliners[0].soldNow} mà vẫn còn hàng — kiểm tra giá, traffic, campaign.`
        : "Đơn và SKU đều không tập trung vào món nào — kiểm tra traffic/payment/campaign toàn shop.";
  return {
    periodDays,
    revenue: { current: curRev, baseline: baseRev, pct: revPct },
    orders: { current: curCnt, baseline: baseCnt, pct: pctChange(curCnt, baseCnt) },
    topDecliners,
    hypothesis,
  };
}
