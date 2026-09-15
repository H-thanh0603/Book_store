import { NextRequest } from "next/server";
import { prisma, prismaRead, withTxRetry, TX_OPTIONS } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, nextBusinessNumber, fail } from "@/lib/api";
import { Prisma } from "@/generated/prisma/client";

/** Org boundary for a stock location: direct store.orgId, legacy region fallback. */
function locationOrgId(loc: {
  store?: { orgId?: string; region?: { orgId: string } | null } | null;
}): string | null {
  return loc.store?.orgId ?? loc.store?.region?.orgId ?? null;
}

// GET /api/transfers — List transfers (org-scoped)
export async function GET(req: NextRequest) {
  let auth;
  try {
    auth = await requirePermission("inventory.view");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");

  const where: Prisma.StockTransferWhereInput = {};
  if (statusFilter) where.status = statusFilter as Prisma.EnumTransferStatusFilter["equals"];
  // P0-2: previously unscoped — any staff listed every tenant's transfers.
  if (auth.orgId) {
    where.OR = [
      { fromLocation: { store: { orgId: auth.orgId } } },
      { toLocation: { store: { orgId: auth.orgId } } },
    ];
  }

  const transfers = await prismaRead.stockTransfer.findMany({
    where,
    include: {
      fromLocation: { select: { id: true, name: true } },
      toLocation: { select: { id: true, name: true } },
      items: {
        include: {
          variant: { include: { product: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return ok({ transfers });
}

// POST /api/transfers — Create transfer (REQUESTED; stock moves at ship time)
export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requirePermission("inventory.manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const body = await req.json().catch(() => ({}));
  const { fromLocationId, toLocationId, items } = body;

  if (!fromLocationId || !toLocationId || !Array.isArray(items) || items.length === 0) {
    return apiError({ status: 400, code: "VALIDATION", message: "fromLocationId, toLocationId, and items are required" });
  }
  if (fromLocationId === toLocationId) {
    return apiError({ status: 400, code: "VALIDATION", message: "Source and destination cannot be the same" });
  }
  // P0-2: item shape was never validated — non-integer/negative/NaN
  // quantities reached the DB layer.
  for (const item of items) {
    if (typeof item?.variantId !== "string" || !item.variantId) {
      return apiError({ status: 400, code: "VALIDATION", message: "Each item needs a variantId" });
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return apiError({ status: 400, code: "VALIDATION", message: `Quantity for variant ${item.variantId} must be a positive integer` });
    }
  }

  // P0-2: locations were loaded bare — a scoped caller could create a
  // transfer between two foreign locations and reserve foreign stock.
  const [fromLoc, toLoc] = await Promise.all([
    prismaRead.stockLocation.findUnique({
      where: { id: fromLocationId },
      include: { store: { select: { orgId: true, regionId: true } } },
    }),
    prismaRead.stockLocation.findUnique({
      where: { id: toLocationId },
      include: { store: { select: { orgId: true, regionId: true } } },
    }),
  ]);
  if (!fromLoc || !toLoc) return apiError({ status: 404, code: "NOT_FOUND", message: "Location not found" });
  if (auth.orgId) {
    const orgs = [locationOrgId(fromLoc), locationOrgId(toLoc)];
    if (orgs.some((o) => o !== auth.orgId))
      return apiError({ status: 404, code: "NOT_FOUND", message: "Location not found" });
    // Variants are org-scoped — a transfer may only move the caller's SKUs.
    const variantRows = await prismaRead.productVariant.findMany({
      where: { id: { in: items.map((i: { variantId: string }) => i.variantId) } },
      select: { id: true, orgId: true },
    });
    const byId = new Map(variantRows.map((v) => [v.id, v.orgId]));
    for (const item of items) {
      if (byId.get(item.variantId) !== auth.orgId)
        return apiError({ status: 404, code: "NOT_FOUND", message: `Variant ${item.variantId} not found` });
    }
  }

  const trfNumber = await nextBusinessNumber("TRF");

  // P0-2: the old code checked availability on a replica OUTSIDE the tx and
  // then blindly incremented `reserved` INSIDE it — a TOCTOU over-reserve,
  // and the increment was never released at ship time (ship moves
  // onHand→inTransit via applyMovement), so `reserved` leaked upward
  // forever. Creation now writes the REQUESTED transfer only; availability
  // is enforced under a FOR UPDATE lock at ship time by applyMovement.
  const transfer = await withTxRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const transfer = await tx.stockTransfer.create({
          data: {
            number: trfNumber,
            fromLocationId,
            toLocationId,
            requestedBy: auth.userId,
            items: {
              create: items.map((item: { variantId: string; quantity: number }) => ({
                variantId: item.variantId,
                quantity: item.quantity,
              })),
            },
          },
          include: {
            items: {
              include: { variant: { include: { product: { select: { name: true } } } } },
            },
          },
        });

        return transfer;
      },
      TX_OPTIONS
    )
  );

  return ok({ transfer });
}
