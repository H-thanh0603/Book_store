import { NextRequest } from "next/server";
import { prisma, prismaRead, TX_OPTIONS } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";

/** Store links must stay inside the caller's org (see ../route.ts). */
async function assertStoresInOrg(storeIds: string[], auth: { orgId: string | null }) {
  if (!auth.orgId || storeIds.length === 0) return;
  const rows = await prismaRead.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, orgId: true },
  });
  const byId = new Map(rows.map((s) => [s.id, s.orgId]));
  for (const sid of storeIds) {
    if (byId.get(sid) !== auth.orgId)
      fail(404, "NOT_FOUND", `Store ${sid} not found`);
  }
}

// PUT /api/promotions/[id] — Update promotion
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requirePermission("promotion.manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const existing = await prismaRead.promotion.findUnique({ where: withOrg(auth, { id }) });
  if (!existing) return apiError({ status: 404, code: "NOT_FOUND", message: "Promotion not found" });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim())
      return apiError({ status: 400, code: "VALIDATION", message: "Name cannot be empty" });
    data.name = body.name.trim();
  }
  if (body.code !== undefined) data.code = body.code?.trim()?.toUpperCase() || null;
  if (body.type !== undefined) {
    if (!["percentage", "fixed", "buy_x_get_y"].includes(body.type))
      return apiError({ status: 400, code: "VALIDATION", message: "Invalid type" });
    data.type = body.type;
  }
  if (body.value !== undefined) {
    if (typeof body.value !== "number" || !Number.isFinite(body.value) || body.value < 0 || body.value > 100_000_000_000)
      return apiError({ status: 400, code: "VALIDATION", message: "Value must be a number between 0 and 100000000000" });
    data.value = BigInt(Math.round(body.value));
  }
  if (body.buyQty !== undefined) {
    if (body.buyQty !== null && (!Number.isInteger(body.buyQty) || body.buyQty <= 0))
      return apiError({ status: 400, code: "VALIDATION", message: "buyQty must be a positive integer" });
    data.buyQty = body.buyQty || null;
  }
  if (body.getQty !== undefined) {
    if (body.getQty !== null && (!Number.isInteger(body.getQty) || body.getQty <= 0))
      return apiError({ status: 400, code: "VALIDATION", message: "getQty must be a positive integer" });
    data.getQty = body.getQty || null;
  }
  if (body.categoryId !== undefined) {
    if (body.categoryId) {
      const cat = await prismaRead.category.findUnique({ where: { id: body.categoryId } });
      if (!cat) return apiError({ status: 404, code: "NOT_FOUND", message: "Category not found" });
    }
    data.categoryId = body.categoryId || null;
  }
  if (body.minQty !== undefined) {
    if (body.minQty !== null && (!Number.isInteger(body.minQty) || body.minQty < 0))
      return apiError({ status: 400, code: "VALIDATION", message: "minQty must be a non-negative integer" });
    data.minQty = body.minQty || 0;
  }
  if (body.channel !== undefined) {
    if (!["ALL", "POS", "WEB"].includes(body.channel))
      return apiError({ status: 400, code: "VALIDATION", message: "Invalid channel" });
    data.channel = body.channel;
  }
  if (body.stackable !== undefined) data.stackable = Boolean(body.stackable);
  if (body.usageLimit !== undefined) {
    if (body.usageLimit !== null && (!Number.isInteger(body.usageLimit) || body.usageLimit < 0))
      return apiError({ status: 400, code: "VALIDATION", message: "usageLimit must be a non-negative integer" });
    data.usageLimit = body.usageLimit || null;
  }
  if (body.memberOnly !== undefined) data.memberOnly = Boolean(body.memberOnly);
  if (body.priority !== undefined) {
    if (!Number.isInteger(body.priority) || body.priority < 0)
      return apiError({ status: 400, code: "VALIDATION", message: "priority must be a non-negative integer" });
    data.priority = body.priority || 0;
  }
  if (body.startAt !== undefined) {
    if (isNaN(Date.parse(body.startAt)))
      return apiError({ status: 400, code: "VALIDATION", message: "Invalid startAt" });
    data.startAt = new Date(body.startAt);
  }
  if (body.endAt !== undefined) {
    if (body.endAt && isNaN(Date.parse(body.endAt)))
      return apiError({ status: 400, code: "VALIDATION", message: "Invalid endAt" });
    data.endAt = body.endAt ? new Date(body.endAt) : null;
  }
  if (body.active !== undefined) data.active = Boolean(body.active);

  // P0-6: store re-link + promo write were two unscoped writes outside a tx
  // (partial failure left links orphaned; foreign storeIds accepted). Now
  // verified, org-scoped, and atomic.
  if (Array.isArray(body.storeIds)) {
    try {
      await assertStoresInOrg(body.storeIds.filter((s: unknown) => typeof s === "string"), auth);
    } catch (e) { return apiError(e); }
  }

  let promotion;
  try {
    promotion = await prisma.$transaction(async (tx) => {
      if (Array.isArray(body.storeIds)) {
        await tx.promotionStore.deleteMany({ where: { promotionId: existing.id } });
        if (body.storeIds.length > 0) {
          await tx.promotionStore.createMany({
            data: body.storeIds.map((sid: string) => ({ promotionId: existing.id, storeId: sid })),
          });
        }
      }
      return tx.promotion.update({
        where: withOrg(auth, { id: existing.id }),
        data,
        include: {
          category: { select: { name: true } },
          stores: { include: { store: { select: { name: true } } } },
        },
      });
    }, TX_OPTIONS);
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002")
      return apiError({ status: 409, code: "CONFLICT", message: "Promotion code already exists" });
    return apiError(e);
  }

  return ok({ promotion });
}

// DELETE /api/promotions/[id] — Deactivate promotion
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requirePermission("promotion.manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const existing = await prismaRead.promotion.findUnique({ where: withOrg(auth, { id }) });
  if (!existing) return apiError({ status: 404, code: "NOT_FOUND", message: "Promotion not found" });

  await prisma.promotion.update({ where: withOrg(auth, { id: existing.id }), data: { active: false } });
  return ok({ message: "Promotion deactivated" });
}

// GET /api/promotions/[id] — Get single promotion
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requirePermission("promotion.view");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const promotion = await prismaRead.promotion.findUnique({
    where: withOrg(auth, { id }),
    include: {
      category: { select: { id: true, name: true } },
      stores: { include: { store: { select: { id: true, name: true } } } },
    },
  });

  if (!promotion) return apiError({ status: 404, code: "NOT_FOUND", message: "Not found" });
  return ok({ promotion });
}
