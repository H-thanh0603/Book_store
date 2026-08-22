import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok, toMoney } from "@/lib/api";

// PATCH /api/gift-cards { code, action: "adjust"|"deactivate", amount? } — lifecycle ops
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
      if (body.amount === undefined || body.amount === null) fail(400, "VALIDATION", "amount required");
      const delta = toMoney(body.amount, "amount");
      if (card.balance + delta < 0n) fail(400, "VALIDATION", "Adjustment would make balance negative");
      const updated = await prisma.giftCard.update({
        where: { id: card.id }, data: { balance: { increment: delta } },
      });
      await prisma.giftCardTransaction.create({
        data: { giftCardId: card.id, amount: delta, balanceAfter: updated.balance, refType: "adjust", refId: auth.userId },
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
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : `GC-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    if (!/^[A-Z0-9-]{6,64}$/.test(code)) fail(400, "VALIDATION", "Invalid gift card code");
    const card = await prisma.giftCard.create({
      data: {
        code, initialValue: amount, balance: amount,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        transactions: { create: { amount, balanceAfter: amount, refType: "issue" } },
      },
    });
    return ok({ id: card.id, code: card.code, balance: Number(card.balance) }, 201);
  } catch (err) {
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
