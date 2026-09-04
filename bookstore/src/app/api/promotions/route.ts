import { NextRequest } from "next/server";
import { prisma, prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";
import { Prisma } from "@/generated/prisma/client";

// GET /api/promotions — List promotions
export async function GET(req: NextRequest) {
  let auth;
  try {
    auth = await requirePermission("promotions:read");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") !== "false";

  const where: Prisma.PromotionWhereInput = withOrg(auth, {});
  if (activeOnly) where.active = true;

  const promotions = await prismaRead.promotion.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
      stores: { include: { store: { select: { id: true, name: true } } } },
    },
    orderBy: { priority: "desc" },
    take: 100,
  });

  return ok({ promotions });
}

// POST /api/promotions — Create promotion
export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requirePermission("promotions:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const body = await req.json().catch(() => ({}));
  const { name, code, type, value, buyQty, getQty, categoryId, minQty, channel, stackable, usageLimit, memberOnly, priority, startAt, endAt, storeIds } = body;

  if (!name?.trim()) return apiError({ status: 400, code: "VALIDATION", message: "Name is required" });
  if (!["percentage", "fixed", "buy_x_get_y"].includes(type)) return apiError({ status: 400, code: "VALIDATION", message: "Invalid type" });
  if (type !== "buy_x_get_y" && (typeof value !== "number" || value < 0)) {
    return apiError({ status: 400, code: "VALIDATION", message: "Value must be a positive number" });
  }
  if (type === "percentage" && value > 100) {
    return apiError({ status: 400, code: "VALIDATION", message: "Percentage cannot exceed 100" });
  }

  const promotion = await prisma.promotion.create({
    data: {
      name: name.trim(),
      orgId: auth.orgId ?? (await prisma.organization.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id,
      code: code?.trim()?.toUpperCase() || null,
      type,
      value: BigInt(Math.round(value)),
      buyQty: buyQty || null,
      getQty: getQty || null,
      categoryId: categoryId || null,
      minQty: minQty || 0,
      channel: channel || "ALL",
      stackable: Boolean(stackable),
      usageLimit: usageLimit || null,
      memberOnly: Boolean(memberOnly),
      priority: priority || 0,
      startAt: startAt ? new Date(startAt) : new Date(),
      endAt: endAt ? new Date(endAt) : null,
      stores: storeIds?.length ? { create: storeIds.map((sid: string) => ({ storeId: sid })) } : undefined,
    },
    include: {
      category: { select: { name: true } },
      stores: { include: { store: { select: { name: true } } } },
    },
  });

  return ok({ promotion });
}
