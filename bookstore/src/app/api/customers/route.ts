import { NextRequest } from "next/server";
import { prisma, prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, getSystemConfig, nextBusinessNumber } from "@/lib/api";
import { Prisma } from "../../../generated/prisma/client";

type Tx = Prisma.TransactionClient;

// Tier thresholds by lifetime points (spec §14: Member/Silver/Gold/Platinum).
const TIERS: [string, number][] = [["Platinum", 3000], ["Gold", 1000], ["Silver", 300], ["Member", 0]];

function tierFor(points: number): string {
  return TIERS.find(([, min]) => points >= min)![0];
}

/** Upsert the account and re-evaluate tier; returns the account. */
async function syncTier(customerId: string, tx: Tx | typeof prisma = prisma) {
  const acct = await tx.loyaltyAccount.upsert({
    where: { customerId }, create: { customerId }, update: {},
  });
  const next = tierFor(acct.points);
  return next === acct.tier ? acct : tx.loyaltyAccount.update({ where: { id: acct.id }, data: { tier: next } });
}

// GET /api/customers?q=  — list + loyalty balance (display-only → replica OK)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("customer.view");
    const q = req.nextUrl.searchParams.get("q");
    const customers = await prismaRead.customer.findMany({
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
      const auth = await requirePermission("customer.update");
      if (!body.name || !body.phone) fail(400, "VALIDATION", "name and phone required");
      // SEC-004: customers belong to an org; a legacy superuser (orgId null)
      // has no org to attach — deny rather than create an orphan.
      if (!auth.orgId) fail(403, "FORBIDDEN", "Customer creation requires an org-scoped account");
      try {
        const customer = await prisma.customer.create({
          data: {
            // Range-allocated sequence — count()+1 races under concurrent
            // creates and collides after deletes (storefront path does this too).
            code: await nextBusinessNumber("CUS"),
            name: body.name,
            phone: body.phone,
            email: body.email ?? null,
            birthday: body.birthday ? new Date(body.birthday) : null,
            address: body.address ?? null,
            orgId: auth.orgId,
          },
          include: { loyalty: true },
        });
        return ok({ customer }, 201);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
          fail(409, "DUPLICATE", "Customer with this phone already exists");
        throw err;
      }
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
      const updated = await prisma.$transaction(async (tx) => {
        const acct = await tx.loyaltyAccount.upsert({
          where: { customerId: body.customerId }, create: { customerId: body.customerId }, update: {},
        });
        // Atomic negative-balance guard: two racing adjustments can both pass a
        // read-then-increment check and drive points below zero; the conditional
        // updateMany makes only the surviving one apply.
        const floor = body.points < 0 ? -body.points : 0;
        const claimed = await tx.loyaltyAccount.updateMany({
          where: { id: acct.id, points: { gte: floor } },
          data: { points: { increment: body.points } },
        });
        if (claimed.count === 0) fail(400, "VALIDATION", "Adjustment would make points negative");
        const fresh = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: acct.id } });
        await tx.loyaltyTransaction.create({
          data: { accountId: acct.id, points: body.points, balanceAfter: fresh.points, type: "ADJUST", refType: "manual", refId: auth.userId },
        });
        const final = await syncTier(body.customerId, tx);
        await tx.auditLog.create({
          data: { actorId: auth.userId, action: "loyalty.adjust", entity: "LoyaltyAccount", entityId: acct.id, after: { delta: body.points } },
        });
        return final;
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
      const updated = await prisma.$transaction(async (tx) => {
        const acct = await tx.loyaltyAccount.upsert({
          where: { customerId: body.customerId }, create: { customerId: body.customerId }, update: {},
        });
        // Serialize per-customer grants: lock the account row so a concurrent
        // birthday_reward blocks here until this tx commits, then sees the
        // committed BONUS row in its (read-committed) duplicate check below.
        await tx.$queryRaw`SELECT id FROM "LoyaltyAccount" WHERE id = ${acct.id} FOR UPDATE`;
        const already = await tx.loyaltyTransaction.findFirst({
          where: { type: "BONUS", refType: "birthday", refId: body.customerId, createdAt: { gte: yearStart } },
        });
        if (already) fail(409, "DUPLICATE", "Birthday reward already granted this year");
        await tx.loyaltyAccount.update({
          where: { id: acct.id }, data: { points: { increment: bonus } },
        });
        const fresh = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: acct.id } });
        await tx.loyaltyTransaction.create({
          data: { accountId: acct.id, points: bonus, balanceAfter: fresh.points, type: "BONUS", refType: "birthday", refId: body.customerId },
        });
        const final = await syncTier(body.customerId, tx);
        await tx.auditLog.create({
          data: { actorId: auth.userId, action: "loyalty.birthday_reward", entity: "LoyaltyAccount", entityId: acct.id, after: { bonus } },
        });
        return final;
      });
      return ok({ points: updated.points, granted: bonus });
    }

    fail(400, "VALIDATION", "Unknown action");
  } catch (err) {
    return apiError(err);
  }
}
