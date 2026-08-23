import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok, toMoney, reqStr, optDate } from "@/lib/api";

// PATCH /api/gift-cards { code, action: "adjust"|"deactivate", amount?, idempotencyKey? }
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requirePermission("promotion.manage");
    const body = await req.json();
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code) fail(400, "VALIDATION", "code required");
    const card = await prisma.giftCard.findUnique({ where: { code } });
    if (!card) fail(404, "NOT_FOUND", "Gift card not found");

    if (body.action === "deactivate") {
      await prisma.giftCard.update({ where: { id: card.id }, data: { active: false } });
      await prisma.auditLog.create({
        data: { actorId: auth.userId, action: "giftcard.deactivate", entity: "GiftCard", entityId: card.id, after: { code } },
      });
      return ok({ code, active: false });
    }

    if (body.action === "adjust") {
      if (!Number.isInteger(body.amount)) fail(400, "VALIDATION", "amount must be an integer");
      const delta = BigInt(body.amount); // signed — toMoney rejects negatives, adjust needs them
      // Replay protection: same key on the same card returns the first result.
      const idemKey =
        typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
          ? body.idempotencyKey.trim().slice(0, 128)
          : null;
      if (idemKey) {
        const prior = await prisma.giftCardTransaction.findFirst({
          where: { giftCardId: card.id, refType: "adjust", refId: idemKey },
          orderBy: { createdAt: "desc" },
        });
        if (prior)
          return ok({ code, balance: Number(prior.balanceAfter), replayed: true });
      }
      // Atomic both ways: negative deltas are a guarded decrement (never below
      // zero), positive deltas are a guarded increment (DB rule: balance can
      // never exceed the card's initial value). Concurrent calls cannot corrupt.
      const updated = await prisma.$transaction(async (tx) => {
        const claimed = delta < 0n
          ? await tx.giftCard.updateMany({
              where: { id: card.id, balance: { gte: -delta } },
              data: { balance: { decrement: -delta } },
            })
          : await tx.giftCard.updateMany({
              where: { id: card.id, balance: { lte: card.initialValue - delta } },
              data: { balance: { increment: delta } },
            });
        if (claimed.count !== 1)
          fail(400, "VALIDATION",
            delta < 0n
              ? "Adjustment would make balance negative"
              : "Adjustment would exceed the gift card's initial value");
        const fresh = await tx.giftCard.findUniqueOrThrow({ where: { id: card.id } });
        await tx.giftCardTransaction.create({
          data: {
            giftCardId: card.id, amount: delta, balanceAfter: fresh.balance,
            refType: "adjust", refId: idemKey ?? randomUUID(),
          },
        });
        return fresh;
      }).catch((err) => {
        // Concurrent duplicate with the same idempotency key lost the unique race.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
          return prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } });
        throw err;
      });
      await prisma.auditLog.create({
        data: { actorId: auth.userId, action: "giftcard.adjust", entity: "GiftCard", entityId: card.id, after: { code, delta: Number(delta) } },
      });
      return ok({ code, balance: Number(updated.balance) });
    }

    fail(400, "VALIDATION", "Unknown action");
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/gift-cards { amount, code?, expiresAt? }
export async function POST(req: NextRequest) {
  try {
    await requirePermission("promotion.manage");
    const body = await req.json();
    const amount = toMoney(body.amount, "amount");
    if (amount <= 0n) fail(400, "VALIDATION", "amount must be positive");
    const expiresAt = optDate(body.expiresAt, "expiresAt");
    const code = typeof body.code === "string" && body.code.trim()
      ? reqStr(body.code, "code", 64).toUpperCase()
      : `GC-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    if (!/^[A-Z0-9-]{6,64}$/.test(code)) fail(400, "VALIDATION", "Invalid gift card code");
    const card = await prisma.giftCard.create({
      data: {
        code, initialValue: amount, balance: amount,
        expiresAt,
        transactions: { create: { amount, balanceAfter: amount, refType: "issue" } },
      },
    });
    return ok({ id: card.id, code: card.code, balance: Number(card.balance) }, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      return fail(409, "DUPLICATE", "Gift card code already exists");
    return apiError(err);
  }
}

export async function GET() {
  try {
    await requirePermission("promotion.manage");
    const cards = await prisma.giftCard.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return ok({ cards: cards.map((card) => ({ ...card, initialValue: Number(card.initialValue), balance: Number(card.balance) })) });
  } catch (err) {
    return apiError(err);
  }
}
