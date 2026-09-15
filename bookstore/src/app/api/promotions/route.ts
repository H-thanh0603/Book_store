import { NextRequest } from "next/server";
import { prisma, prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";
import { withOrg, defaultOrgId } from "@/lib/org-scope";
import { Prisma, PromoChannel } from "@/generated/prisma/client";

const CHANNELS: PromoChannel[] = ["ALL", "POS", "WEB"];

/** P0-6: storeIds linked to a promotion must all belong to the caller's org. */
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

/** P0-6: numeric/enum fields were trusted raw — NaN/negative/huge values
 *  reached BigInt() (throw → 500) or the DB. Validate up front. */
function parsePromoNumbers(body: Record<string, unknown>, isCreate: boolean) {
  const out: { value?: bigint; buyQty?: number | null; getQty?: number | null; minQty?: number; usageLimit?: number | null; priority?: number } = {};
  const type = body.type as string;
  if (body.value !== undefined || (isCreate && type !== "buy_x_get_y")) {
    const v = body.value as number;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100_000_000_000)
      fail(400, "VALIDATION", "Value must be a number between 0 and 100000000000");
    if (type === "percentage" && v > 100)
      fail(400, "VALIDATION", "Percentage cannot exceed 100");
    out.value = BigInt(Math.round(v));
  }
  if (body.buyQty !== undefined || (isCreate && type === "buy_x_get_y")) {
    const q = (body.buyQty as number) ?? null;
    if (q !== null && (!Number.isInteger(q) || (q as number) <= 0))
      fail(400, "VALIDATION", "buyQty must be a positive integer");
    out.buyQty = (q as number) ?? null;
  }
  if (body.getQty !== undefined || (isCreate && type === "buy_x_get_y")) {
    const q = (body.getQty as number) ?? null;
    if (q !== null && (!Number.isInteger(q) || (q as number) <= 0))
      fail(400, "VALIDATION", "getQty must be a positive integer");
    out.getQty = (q as number) ?? null;
  }
  if (isCreate && type === "buy_x_get_y" && (out.buyQty == null || out.getQty == null))
    fail(400, "VALIDATION", "buy_x_get_y requires buyQty and getQty");
  for (const key of ["minQty", "usageLimit", "priority"] as const) {
    const raw = body[key] as number | null | undefined;
    if (raw !== undefined && raw !== null && (!Number.isInteger(raw) || (raw as number) < 0))
      fail(400, "VALIDATION", `${key} must be a non-negative integer`);
    (out as Record<string, unknown>)[key] = (raw as number) || (key === "minQty" ? 0 : key === "priority" ? 0 : null);
  }
  if (body.channel !== undefined && !CHANNELS.includes(body.channel as PromoChannel))
    fail(400, "VALIDATION", `channel must be one of ${CHANNELS.join(", ")}`);
  return out;
}

// GET /api/promotions — List promotions
export async function GET(req: NextRequest) {
  let auth;
  try {
    auth = await requirePermission("promotion.view");
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
    auth = await requirePermission("promotion.manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const body = await req.json().catch(() => ({}));
  const { name, code, type, categoryId, stackable, memberOnly, startAt, endAt, storeIds, active } = body;  if (!name?.trim()) return apiError({ status: 400, code: "VALIDATION", message: "Name is required" });
  if (!["percentage", "fixed", "buy_x_get_y"].includes(type)) return apiError({ status: 400, code: "VALIDATION", message: "Invalid type" });
  let nums;
  try {
    nums = parsePromoNumbers(body, true);
  } catch (e) { return apiError(e); }
  if (Array.isArray(storeIds)) {
    try {
      await assertStoresInOrg(storeIds.filter((s: unknown) => typeof s === "string"), auth);
    } catch (e) { return apiError(e); }
  }
  if (categoryId) {
    const cat = await prismaRead.category.findUnique({ where: { id: categoryId } });
    if (!cat) return apiError({ status: 404, code: "NOT_FOUND", message: "Category not found" });
  }
  if (startAt && isNaN(Date.parse(startAt))) return apiError({ status: 400, code: "VALIDATION", message: "Invalid startAt" });
  if (endAt && isNaN(Date.parse(endAt))) return apiError({ status: 400, code: "VALIDATION", message: "Invalid endAt" });

  let promotion;
  try {
    promotion = await prisma.promotion.create({
      data: {
        name: name.trim(),
        orgId: auth.orgId ?? (await defaultOrgId()),
        code: code?.trim()?.toUpperCase() || null,
        type,
        value: nums.value ?? 0n,
        buyQty: nums.buyQty ?? null,
        getQty: nums.getQty ?? null,
        categoryId: categoryId || null,
        minQty: nums.minQty ?? 0,
        channel: ((body.channel as PromoChannel) || "ALL") as PromoChannel,
        stackable: Boolean(stackable),
        usageLimit: nums.usageLimit ?? null,
        memberOnly: Boolean(memberOnly),
        priority: nums.priority ?? 0,
        // AI drafts pass active:false so nothing goes live without human review.
        // Default true preserves the manual create flow.
        active: active !== false,
        startAt: startAt ? new Date(startAt) : new Date(),
        endAt: endAt ? new Date(endAt) : null,
        stores: storeIds?.length ? { create: storeIds.map((sid: string) => ({ storeId: sid })) } : undefined,
      },
      include: {
        category: { select: { name: true } },
        stores: { include: { store: { select: { name: true } } } },
      },
    });
  } catch (e: unknown) {
    // P0-6: duplicate promo code was a raw P2002 → 500. Promotion.code is
    // globally unique, so report it as a 409.
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002")
      return apiError({ status: 409, code: "CONFLICT", message: "Promotion code already exists" });
    return apiError(e);
  }

  return ok({ promotion });
}
