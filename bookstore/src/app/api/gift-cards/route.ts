import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok, toMoney } from "@/lib/api";

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
