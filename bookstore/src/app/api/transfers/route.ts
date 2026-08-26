import { NextRequest } from "next/server";
import { prisma, prismaRead, withTxRetry, TX_OPTIONS } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, nextBusinessNumber } from "@/lib/api";
import { Prisma } from "@/generated/prisma/client";

// GET /api/transfers — List transfers
export async function GET(req: NextRequest) {
  try {
    await requirePermission("inventory:read");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");

  const where: Prisma.StockTransferWhereInput = {};
  if (statusFilter) where.status = statusFilter as Prisma.EnumTransferStatusFilter["equals"];

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

// POST /api/transfers — Create transfer
export async function POST(req: NextRequest) {
  try {
    await requirePermission("inventory:manage");
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

  // Verify locations
  const [fromLoc, toLoc] = await Promise.all([
    prismaRead.stockLocation.findUnique({ where: { id: fromLocationId } }),
    prismaRead.stockLocation.findUnique({ where: { id: toLocationId } }),
  ]);
  if (!fromLoc || !toLoc) return apiError({ status: 404, code: "NOT_FOUND", message: "Location not found" });

  // Verify stock availability
  for (const item of items) {
    const balance = await prismaRead.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: item.variantId, locationId: fromLocationId } },
    });
    const available = (balance?.onHand ?? 0) - (balance?.reserved ?? 0);
    if (available < item.quantity) {
      return apiError({ status: 400, code: "VALIDATION", message: `Insufficient stock for variant ${item.variantId}: available ${available}, requested ${item.quantity}` });
    }
  }

  const trfNumber = await nextBusinessNumber("TRF");

  const transfer = await withTxRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const transfer = await tx.stockTransfer.create({
          data: {
            number: trfNumber,
            fromLocationId,
            toLocationId,
            requestedBy: "system",
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

        // Reserve stock at source location
        for (const item of items) {
          await tx.inventoryBalance.update({
            where: { variantId_locationId: { variantId: item.variantId, locationId: fromLocationId } },
            data: { reserved: { increment: item.quantity } },
          });
        }

        return transfer;
      },
      TX_OPTIONS
    )
  );

  return ok({ transfer });
}
