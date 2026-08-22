import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";

// GET /api/promotions — list all (builder UI)
export async function GET() {
  try {
    await requirePermission("promotion.manage");
    const promotions = await prisma.promotion.findMany({
      include: { category: true, stores: true },
      orderBy: [{ active: "desc" }, { priority: "desc" }],
      take: 100,
    });
    return ok({ promotions });
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/promotions — create
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("promotion.manage");
    const b = await req.json();
    if (!b.name || !b.type) fail(400, "VALIDATION", "name and type required");
    if (!["percentage", "fixed", "buy_x_get_y"].includes(b.type)) fail(400, "VALIDATION", "Invalid promotion type");
    if (b.type === "percentage" && (typeof b.value !== "number" || b.value <= 0 || b.value > 100))
      fail(400, "VALIDATION", "percentage value must be 1-100");
    if (b.type !== "percentage" && (typeof b.value !== "number" || b.value <= 0))
      fail(400, "VALIDATION", "value must be positive");
    if (b.type === "buy_x_get_y" && (!b.buyQty || !b.getQty))
      fail(400, "VALIDATION", "buyQty and getQty required for buy_x_get_y");
    if (b.code && await prisma.promotion.findUnique({ where: { code: String(b.code).trim().toUpperCase() } }))
      fail(409, "DUPLICATE", `Code ${b.code} already exists`);
    const promo = await prisma.promotion.create({
      data: {
        name: b.name,
        code: b.code ? String(b.code).trim().toUpperCase() : null,
        type: b.type,
        value: BigInt(Math.round(b.value)),
        buyQty: b.buyQty ?? null,
        getQty: b.getQty ?? null,
        categoryId: b.categoryId ?? null,
        minQty: Number.isInteger(b.minQty) ? b.minQty : 0,
        channel: ["POS", "WEB", "ALL"].includes(b.channel) ? b.channel : "ALL",
        stackable: !!b.stackable,
        usageLimit: Number.isInteger(b.usageLimit) ? b.usageLimit : null,
        memberOnly: !!b.memberOnly,
        priority: Number.isInteger(b.priority) ? b.priority : 0,
        startAt: b.startAt ? new Date(b.startAt) : new Date(),
        endAt: b.endAt ? new Date(b.endAt) : null,
        stores: Array.isArray(b.storeIds)
          ? { create: b.storeIds.filter((id: unknown): id is string => typeof id === "string").map((storeId: string) => ({ storeId })) }
          : undefined,
      },
    });
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "promotion.create", entity: "Promotion", entityId: promo.id, after: { name: promo.name } },
    });
    return ok({ id: promo.id }, 201);
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/promotions — activate/deactivate only; editing money-affecting rules
// after launch needs a versioned-promo design, skipped.
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requirePermission("promotion.manage");
    const b = await req.json();
    if (!b.id || typeof b.active !== "boolean") fail(400, "VALIDATION", "id and boolean active required");
    const promo = await prisma.promotion.update({ where: { id: b.id }, data: { active: b.active } });
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "promotion.set_active", entity: "Promotion", entityId: promo.id, after: { active: b.active } },
    });
    return ok({ id: promo.id, active: promo.active });
  } catch (err) {
    return apiError(err);
  }
}

// GET usage count per customer for a promo — redemption-limit support.
// ponytail: counts POS redemptions via PosTransactionItem.promoId; WEB orders don't
// record the promo per item yet, add an orderId/promoId ledger column when needed.
export async function PUT(req: NextRequest) {
  try {
    await requirePermission("promotion.manage");
    const body = await req.json();
    if (!body.promoId || !body.customerId) fail(400, "VALIDATION", "promoId and customerId required");
    const count = await prisma.posTransactionItem.count({
      where: { promoId: body.promoId, tx: { customerId: body.customerId, status: "COMPLETED" } },
    });
    return ok({ count });
  } catch (err) {
    return apiError(err);
  }
}
