import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertStoreAccess, requirePermission, resolveStoreScope } from "@/lib/auth";
import { apiError, ok, fail, optStr, reqStr, requireRef } from "@/lib/api";

// GET /api/promotions — list promotions visible to the caller.
// Store-scoped callers see promos linked to their stores plus org-wide ones.
export async function GET() {
  try {
    const auth = await requirePermission("promotion.manage");
    const scope = resolveStoreScope(auth, undefined, "promotion.manage");
    const promotions = await prisma.promotion.findMany({
      where: scope
        ? { OR: [{ stores: { none: {} } }, { stores: { some: { storeId: { in: scope } } } }] }
        : undefined,
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
    const name = reqStr(b.name, "name");
    if (!b.type || !["percentage", "fixed", "buy_x_get_y"].includes(b.type))
      fail(400, "VALIDATION", "type must be percentage, fixed or buy_x_get_y");
    if (b.type === "percentage" && (typeof b.value !== "number" || b.value <= 0 || b.value > 100))
      fail(400, "VALIDATION", "percentage value must be 1-100");
    if (b.type !== "percentage" && (typeof b.value !== "number" || b.value <= 0))
      fail(400, "VALIDATION", "value must be positive");
    if (b.type === "buy_x_get_y" && (!Number.isInteger(b.buyQty) || b.buyQty < 1 || !Number.isInteger(b.getQty) || b.getQty < 1))
      fail(400, "VALIDATION", "buyQty and getQty must be positive integers for buy_x_get_y");
    if (b.minQty !== undefined && (!Number.isInteger(b.minQty) || b.minQty < 0))
      fail(400, "VALIDATION", "minQty must be a non-negative integer");
    if (b.usageLimit !== undefined && b.usageLimit !== null && (!Number.isInteger(b.usageLimit) || b.usageLimit < 1))
      fail(400, "VALIDATION", "usageLimit must be a positive integer");

    const code = optStr(b.code, "code", 64)?.toUpperCase() ?? null;
    if (code && await prisma.promotion.findUnique({ where: { code } }))
      fail(409, "DUPLICATE", `Code ${code} already exists`);
    if (b.categoryId) requireRef(await prisma.category.findUnique({ where: { id: b.categoryId }, select: { id: true } }), "Category");

    // Store links: every referenced store must exist AND be inside the caller's scope.
    let storeLinks: string[] = [];
    if (Array.isArray(b.storeIds)) {
      const uniqueIds = new Set<string>(
        (b.storeIds as unknown[]).filter((id): id is string => typeof id === "string"),
      );
      storeLinks = [...uniqueIds];
      for (const storeId of storeLinks) {
        requireRef(await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } }), `Store ${storeId}`);
        assertStoreAccess(auth, storeId, "promotion.manage");
      }
    }

    const promo = await prisma.promotion.create({
      data: {
        name,
        code,
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
        stores: storeLinks.length
          ? { create: storeLinks.map((storeId) => ({ storeId })) }
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
    const promo = requireRef(
      await prisma.promotion.findUnique({ where: { id: b.id }, include: { stores: true } }),
      "Promotion",
    );
    // Toggling affects every linked store. An org-wide promo (no links) or a
    // multi-store promo partially outside the caller's scope is an organisation-
    // level act — store-scoped callers may only touch promos fully inside their scope.
    const scope = resolveStoreScope(auth, undefined, "promotion.manage");
    if (scope !== null) {
      const fullyInScope =
        promo.stores.length > 0 && promo.stores.every((s) => scope.includes(s.storeId));
      if (!fullyInScope)
        fail(403, "FORBIDDEN", "This promotion spans stores outside your scope");
    }
    const updated = await prisma.promotion.update({
      where: { id: promo.id },
      data: { active: b.active },
    });
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "promotion.set_active", entity: "Promotion", entityId: promo.id, after: { active: b.active } },
    });
    return ok({ id: updated.id, active: updated.active });
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
