import { NextRequest } from "next/server";
import { prisma, prismaRead, withTxRetry, TX_OPTIONS } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

// PUT /api/inventory/counts/[id] — Update count items or post count
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("inventory:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { action, items } = body;

  // Verify count exists and is draft
  const existing = await prismaRead.inventoryCount.findUnique({ where: { id } });
  if (!existing) return apiError({ status: 404, code: "NOT_FOUND", message: "Inventory count not found" });
  if (existing.status !== "DRAFT") {
    return apiError({ status: 400, code: "VALIDATION", message: "Only DRAFT counts can be updated" });
  }

  if (action === "update_items" && Array.isArray(items)) {
    // Update counted quantities
    await withTxRetry(() =>
      prisma.$transaction(
        async (tx) => {
          for (const item of items) {
            if (item.id && typeof item.countedQty === "number") {
              await tx.inventoryCountItem.update({
                where: { id: item.id },
                data: { countedQty: item.countedQty },
              });
            }
          }
        },
        TX_OPTIONS
      )
    );
    return ok({ message: "Items updated" });
  }

  if (action === "post") {
    // Post the count: adjust inventory based on differences
    return await withTxRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const count = await tx.inventoryCount.findUnique({
            where: { id },
            include: { items: true },
          });
          if (!count) return apiError({ status: 404, code: "NOT_FOUND", message: "Count not found" });
          if (count.status !== "DRAFT") {
            return apiError({ status: 400, code: "VALIDATION", message: "Already posted" });
          }

          let adjustments = 0;
          for (const item of count.items) {
            const diff = item.countedQty - item.expectedQty;
            if (diff !== 0) {
              // Get current balance for balanceAfter
              const balance = await tx.inventoryBalance.findUnique({
                where: { variantId_locationId: { variantId: item.variantId, locationId: count.locationId } },
                select: { onHand: true },
              });

              // Create adjustment movement
              await tx.inventoryMovement.create({
                data: {
                  variantId: item.variantId,
                  locationId: count.locationId,
                  type: "STOCK_ADJUSTMENT",
                  quantity: diff, // positive = add, negative = subtract
                  balanceAfter: (balance?.onHand ?? 0) + diff,
                  refType: "inventory_count",
                  refId: count.id,
                  userId: null,
                },
              });

              // Update balance
              await tx.inventoryBalance.updateMany({
                where: { variantId: item.variantId, locationId: count.locationId },
                data: { onHand: { increment: diff } },
              });

              adjustments++;
            }
          }

          // Mark count as posted
          await tx.inventoryCount.update({
            where: { id },
            data: { status: "POSTED", postedAt: new Date() },
          });

          return ok({ message: `Count posted with ${adjustments} adjustments`, adjustments });
        },
        TX_OPTIONS
      )
    );
  }

  if (action === "cancel") {
    await prisma.inventoryCount.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return ok({ message: "Count cancelled" });
  }

  return apiError({ status: 400, code: "VALIDATION", message: "Invalid action" });
}

// GET /api/inventory/counts/[id] — Get single count with items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("inventory:read");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const count = await prismaRead.inventoryCount.findUnique({
    where: { id },
    include: {
      location: { select: { id: true, name: true } },
      items: {
        include: {
          variant: {
            include: {
              product: { select: { name: true } },
              barcodes: { select: { barcode: true }, take: 1 },
            },
          },
        },
      },
    },
  });

  if (!count) return apiError({ status: 404, code: "NOT_FOUND", message: "Not found" });
  return ok({ count });
}
