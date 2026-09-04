import { NextRequest } from "next/server";
import { prisma, prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";

// PUT /api/promotions/[id] — Update promotion
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requirePermission("promotions:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const existing = await prismaRead.promotion.findUnique({ where: withOrg(auth, { id }) });
  if (!existing) return apiError({ status: 404, code: "NOT_FOUND", message: "Promotion not found" });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.code !== undefined) data.code = body.code?.trim()?.toUpperCase() || null;
  if (body.type !== undefined) data.type = body.type;
  if (body.value !== undefined) data.value = BigInt(Math.round(body.value));
  if (body.buyQty !== undefined) data.buyQty = body.buyQty || null;
  if (body.getQty !== undefined) data.getQty = body.getQty || null;
  if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
  if (body.minQty !== undefined) data.minQty = body.minQty || 0;
  if (body.channel !== undefined) data.channel = body.channel;
  if (body.stackable !== undefined) data.stackable = Boolean(body.stackable);
  if (body.usageLimit !== undefined) data.usageLimit = body.usageLimit || null;
  if (body.memberOnly !== undefined) data.memberOnly = Boolean(body.memberOnly);
  if (body.priority !== undefined) data.priority = body.priority || 0;
  if (body.startAt !== undefined) data.startAt = new Date(body.startAt);
  if (body.endAt !== undefined) data.endAt = body.endAt ? new Date(body.endAt) : null;
  if (body.active !== undefined) data.active = Boolean(body.active);

  // Update store associations
  if (Array.isArray(body.storeIds)) {
    await prisma.promotionStore.deleteMany({ where: { promotionId: id } });
    if (body.storeIds.length > 0) {
      await prisma.promotionStore.createMany({
        data: body.storeIds.map((sid: string) => ({ promotionId: id, storeId: sid })),
      });
    }
  }

  const promotion = await prisma.promotion.update({
    where: { id },
    data,
    include: {
      category: { select: { name: true } },
      stores: { include: { store: { select: { name: true } } } },
    },
  });

  return ok({ promotion });
}

// DELETE /api/promotions/[id] — Deactivate promotion
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requirePermission("promotions:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const existing = await prismaRead.promotion.findUnique({ where: withOrg(auth, { id }) });
  if (!existing) return apiError({ status: 404, code: "NOT_FOUND", message: "Promotion not found" });

  await prisma.promotion.update({ where: { id }, data: { active: false } });
  return ok({ message: "Promotion deactivated" });
}

// GET /api/promotions/[id] — Get single promotion
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requirePermission("promotions:read");
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
