import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, getSystemConfig } from "@/lib/api";

// Tier thresholds by lifetime points (spec §14: Member/Silver/Gold/Platinum).
const TIERS: [string, number][] = [["Platinum", 3000], ["Gold", 1000], ["Silver", 300], ["Member", 0]];

function tierFor(points: number): string {
  return TIERS.find(([, min]) => points >= min)![0];
}

/** Upsert the account and re-evaluate tier; returns the account. */
async function syncTier(customerId: string) {
  const acct = await prisma.loyaltyAccount.upsert({
    where: { customerId }, create: { customerId }, update: {},
  });
  const next = tierFor(acct.points);
  return next === acct.tier ? acct : prisma.loyaltyAccount.update({ where: { id: acct.id }, data: { tier: next } });
}

// GET /api/customers?q=  — list + loyalty balance
export async function GET(req: NextRequest) {
  try {
    await requirePermission("customer.view");
    const q = req.nextUrl.searchParams.get("q");
    const customers = await prisma.customer.findMany({
      where: q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { code: { contains: q, mode: "insensitive" } }] }
        : {},
      include: { loyalty: true },
      orderBy: { code: "desc" },
      take: 50,
    });
    return ok({ customers });
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/customers { action:"create"|"history", ... }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "create") {
      await requirePermission("customer.update");
      if (!body.name || !body.phone) fail(400, "VALIDATION", "name and phone required");
      const count = await prisma.customer.count();
      const customer = await prisma.customer.create({
        data: {
          code: `CUS-${String(count + 1).padStart(6, "0")}`,
          name: body.name,
          phone: body.phone,
          email: body.email ?? null,
          birthday: body.birthday ? new Date(body.birthday) : null,
          address: body.address ?? null,
        },
        include: { loyalty: true },
      });
      return ok({ customer }, 201);
    }

    if (body.action === "history") {
      await requirePermission("customer.view");
      const acct = await prisma.loyaltyAccount.findUnique({
        where: { customerId: body.customerId },
        include: { transactions: { orderBy: { createdAt: "desc" }, take: 50 } },
      });
      if (!acct) return ok({ points: 0, tier: null, transactions: [] });
      return ok({ points: acct.points, tier: acct.tier, transactions: acct.transactions });
    }

    // Manual point adjustment — always through the ledger (spec §14).
    if (body.action === "adjust") {
      const auth = await requirePermission("promotion.manage");
      if (!body.customerId || !Number.isInteger(body.points) || body.points === 0)
        fail(400, "VALIDATION", "customerId and non-zero integer points required");
      const acct = await prisma.loyaltyAccount.upsert({
        where: { customerId: body.customerId }, create: { customerId: body.customerId }, update: {},
      });
      if (acct.points + body.points < 0) fail(400, "VALIDATION", "Adjustment would make points negative");
      const updated = await prisma.loyaltyAccount.update({
        where: { id: acct.id }, data: { points: { increment: body.points } },
      });
      await prisma.loyaltyTransaction.create({
        data: { accountId: acct.id, points: body.points, balanceAfter: updated.points, type: "ADJUST", refType: "manual", refId: auth.userId },
      });
      await syncTier(body.customerId);
      await prisma.auditLog.create({
        data: { actorId: auth.userId, action: "loyalty.adjust", entity: "LoyaltyAccount", entityId: acct.id, after: { delta: body.points } },
      });
      return ok({ points: updated.points });
    }

    // Birthday reward — one bonus grant per year per customer.
    if (body.action === "birthday_reward") {
      const auth = await requirePermission("promotion.manage");
      if (!body.customerId) fail(400, "VALIDATION", "customerId required");
      const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
      if (!customer?.birthday) fail(400, "VALIDATION", "Customer has no birthday on file");
      const bonus = await getSystemConfig<number>("loyalty.birthdayBonusPoints", 100);
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      const already = await prisma.loyaltyTransaction.findFirst({
        where: { type: "BONUS", refType: "birthday", refId: body.customerId, createdAt: { gte: yearStart } },
      });
      if (already) fail(409, "DUPLICATE", "Birthday reward already granted this year");
      const acct = await prisma.loyaltyAccount.upsert({
        where: { customerId: body.customerId }, create: { customerId: body.customerId }, update: {},
      });
      const updated = await prisma.loyaltyAccount.update({
        where: { id: acct.id }, data: { points: { increment: bonus } },
      });
      await prisma.loyaltyTransaction.create({
        data: { accountId: acct.id, points: bonus, balanceAfter: updated.points, type: "BONUS", refType: "birthday", refId: body.customerId },
      });
      await syncTier(body.customerId);
      await prisma.auditLog.create({
        data: { actorId: auth.userId, action: "loyalty.birthday_reward", entity: "LoyaltyAccount", entityId: acct.id, after: { bonus } },
      });
      return ok({ points: updated.points, granted: bonus });
    }

    fail(400, "VALIDATION", "Unknown action");
  } catch (err) {
    return apiError(err);
  }
}
