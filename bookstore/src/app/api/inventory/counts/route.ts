import { NextRequest } from "next/server";
import { prisma, prismaRead, withTxRetry, TX_OPTIONS } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, nextBusinessNumber } from "@/lib/api";
import { Prisma } from "@/generated/prisma/client";

// GET /api/inventory/counts — List inventory counts
export async function GET(req: NextRequest) {
  try {
    await requirePermission("inventory:read");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const locationId = url.searchParams.get("locationId");

  const where: Prisma.InventoryCountWhereInput = {};
  if (statusFilter && ["DRAFT", "POSTED", "CANCELLED"].includes(statusFilter)) {
    where.status = statusFilter as "DRAFT" | "POSTED" | "CANCELLED";
  }
  if (locationId) where.locationId = locationId;

  const counts = await prismaRead.inventoryCount.findMany({
    where,
    include: {
      location: { select: { id: true, name: true } },
      items: {
        include: {
          variant: {
            include: { product: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return ok({ counts });
}

// POST /api/inventory/counts — Create a new inventory count
export async function POST(req: NextRequest) {
  try {
    await requirePermission("inventory:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const body = await req.json().catch(() => ({}));
  const locationId = body.locationId;
  if (!locationId || typeof locationId !== "string") {
    return apiError({ status: 400, code: "VALIDATION", message: "locationId is required" });
  }

  // Verify location exists
  const location = await prismaRead.stockLocation.findUnique({ where: { id: locationId } });
  if (!location) return apiError({ status: 404, code: "NOT_FOUND", message: "Location not found" });

  // Get all variants with stock at this location
  const balances = await prismaRead.inventoryBalance.findMany({
    where: { locationId, onHand: { gt: 0 } },
    include: { variant: { include: { product: { select: { name: true } } } } },
  });

  if (balances.length === 0) {
    return apiError({ status: 400, code: "VALIDATION", message: "No products with stock at this location" });
  }

  const countNumber = await nextBusinessNumber("IC");

  const count = await withTxRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const count = await tx.inventoryCount.create({
          data: {
            number: countNumber,
            locationId,
            countedBy: "system", // Will be replaced with actual user
            items: {
              create: balances.map((b) => ({
                variantId: b.variantId,
                expectedQty: b.onHand,
                countedQty: 0, // To be filled by counter
              })),
            },
          },
          include: {
            items: {
              include: {
                variant: { include: { product: { select: { name: true } } } },
              },
            },
          },
        });
        return count;
      },
      TX_OPTIONS
    )
  );

  return ok({ count });
}
