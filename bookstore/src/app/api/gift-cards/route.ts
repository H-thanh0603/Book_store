import { NextRequest } from "next/server";
import { prisma, prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";
import { Prisma } from "@/generated/prisma/client";
import { randomBytes } from "crypto";

// GET /api/gift-cards — List gift cards
export async function GET(req: NextRequest) {
  let auth;
  try {
    auth = await requirePermission("gift_cards:read");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const activeOnly = url.searchParams.get("active") !== "false";

  const where: Prisma.GiftCardWhereInput = withOrg(auth, {});
  if (activeOnly) where.active = true;
  if (q) where.code = { contains: q, mode: "insensitive" };

  const giftCards = await prismaRead.giftCard.findMany({
    where,
    include: {
      transactions: { orderBy: { createdAt: "desc" }, take: 10 },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return ok({ giftCards });
}

// POST /api/gift-cards — Issue new gift card
export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requirePermission("gift_cards:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const body = await req.json().catch(() => ({}));
  const { initialValue, expiresAt, code: customCode } = body;

  if (typeof initialValue !== "number" || initialValue <= 0) {
    return apiError({ status: 400, code: "VALIDATION", message: "Initial value must be positive" });
  }

  const code = customCode?.trim()?.toUpperCase() || `GC${randomBytes(4).toString("hex").toUpperCase()}`;

  const giftCard = await prisma.giftCard.create({
    data: {
      code,
      orgId: auth.orgId ?? (await prisma.organization.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id,
      initialValue: BigInt(Math.round(initialValue)),
      balance: BigInt(Math.round(initialValue)),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      transactions: {
        create: {
          amount: BigInt(Math.round(initialValue)),
          balanceAfter: BigInt(Math.round(initialValue)),
          refType: "issue",
        },
      },
    },
    include: { transactions: true },
  });

  return ok({ giftCard });
}
