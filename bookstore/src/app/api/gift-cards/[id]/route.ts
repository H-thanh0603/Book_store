import { NextRequest } from "next/server";
import { prisma, prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

// PUT /api/gift-cards/[id] — Update gift card
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("gift_cards:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { action, amount, reason } = body;

  const existing = await prismaRead.giftCard.findUnique({ where: { id } });
  if (!existing) return apiError({ status: 404, code: "NOT_FOUND", message: "Gift card not found" });

  if (action === "adjust") {
    if (typeof amount !== "number") return apiError({ status: 400, code: "VALIDATION", message: "Amount is required" });
    if (!reason?.trim()) return apiError({ status: 400, code: "VALIDATION", message: "Reason is required for adjustment" });

    const newBalance = Number(existing.balance) + amount;
    if (newBalance < 0) return apiError({ status: 400, code: "VALIDATION", message: "Insufficient balance" });

    const adjusted = await prisma.giftCard.update({
      where: { id },
      data: { balance: BigInt(newBalance) },
    });

    await prisma.giftCardTransaction.create({
      data: {
        giftCardId: id,
        amount: BigInt(amount),
        balanceAfter: BigInt(newBalance),
        refType: "adjustment",
        refId: reason.trim(),
      },
    });

    return ok({ giftCard: adjusted });
  }

  if (action === "deactivate") {
    await prisma.giftCard.update({ where: { id }, data: { active: false } });
    return ok({ message: "Gift card deactivated" });
  }

  if (action === "activate") {
    await prisma.giftCard.update({ where: { id }, data: { active: true } });
    return ok({ message: "Gift card activated" });
  }

  return apiError({ status: 400, code: "VALIDATION", message: "Invalid action" });
}

// GET /api/gift-cards/[id] — Get single gift card
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("gift_cards:read");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const giftCard = await prismaRead.giftCard.findUnique({
    where: { id },
    include: { transactions: { orderBy: { createdAt: "desc" } } },
  });

  if (!giftCard) return apiError({ status: 404, code: "NOT_FOUND", message: "Not found" });
  return ok({ giftCard });
}
