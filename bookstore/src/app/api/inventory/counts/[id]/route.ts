import { NextRequest } from "next/server";
import { prisma, prismaRead, withTxRetry, TX_OPTIONS } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";

// PUT /api/inventory/counts/[id] — Update count items or post count
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requirePermission("inventory:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { action, items } = body;

  // Verify count exists, is draft, and its location belongs to the caller's
  // org (audit SEC-005 — counts link to org only via the location chain).
  const existing = await prismaRead.inventoryCount.findUnique({
    where: { id },
    include: { location: { include: { store: { include: { region: { select: { orgId: true } } } } } } },
  });
  if (!existing) return apiError({ status: 404, code: "NOT_FOUND", message: "Inventory count not found" });
  if (auth.orgId && existing.location.store?.region?.orgId !== auth.orgId)
    return apiError({ status: 404, code: "NOT_FOUND", message: "Inventory count not found" });
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
    // Post the count: adjust inventory based on differences.
    // Rewrite per audit 2026-08-30 INV-001:
    //  1. CLAIM the DRAFT→POSTED transition FIRST (conditional updateMany) —
    //     the old check-then-post let two concurrent posts double-adjust.
    //  2. Diff against the LIVE balance, not the expectedQty snapshot taken
    //     when the count was created (snapshot 10, sold 3, counted 7 → the
    //     old diff −3 set onHand to 4; correct answer is 7). Setting
    //     onHand := countedQty via applyMovement does this by construction.
    return await withTxRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const claimed = await tx.inventoryCount.updateMany({
            where: { id, status: "DRAFT" },
            data: { status: "POSTED", postedAt: new Date() },
          });
          if (claimed.count !== 1)
            return apiError({ status: 409, code: "INVALID_STATUS_TRANSITION", message: "Count was already posted or cancelled" });

          const count = await tx.inventoryCount.findUnique({ where: { id }, include: { items: true } });
          if (!count) return apiError({ status: 404, code: "NOT_FOUND", message: "Inventory count not found" });

          let adjustments = 0;
          for (const item of count.items) {
            const balance = await tx.inventoryBalance.findUnique({
              where: { variantId_locationId: { variantId: item.variantId, locationId: count.locationId } },
              select: { onHand: true },
            });
            const diff = item.countedQty - (balance?.onHand ?? 0);
            if (diff !== 0) {
              // A count is ground truth: allowNegative so a shrinkage count
              // can pull onHand below the reserved level without failing.
              await applyMovement(tx, {
                variantId: item.variantId,
                locationId: count.locationId,
                type: "STOCK_ADJUSTMENT",
                quantityDelta: diff,
                refType: "inventory_count",
                refId: count.id,
                allowNegative: true,
              });
              adjustments++;
            }
          }

          return ok({ message: `Count posted with ${adjustments} adjustments`, adjustments });
        },
        TX_OPTIONS
      )
    );
  }

  if (action === "cancel") {
    // Claim the transition too: cancelling an already-POSTED count would wipe
    // the audit link to the adjustments it posted.
    const claimed = await prisma.inventoryCount.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "CANCELLED" },
    });
    if (claimed.count !== 1)
      return apiError({ status: 400, code: "VALIDATION", message: "Only DRAFT counts can be cancelled" });
    return ok({ message: "Count cancelled" });
  }

  return apiError({ status: 400, code: "VALIDATION", message: "Invalid action" });
}

// GET /api/inventory/counts/[id] — Get single count with items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requirePermission("inventory:read");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const count = await prismaRead.inventoryCount.findUnique({
    where: { id },
    include: {
      location: { select: { id: true, name: true, store: { select: { region: { select: { orgId: true } } } } } },
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
  if (auth.orgId && count.location.store?.region?.orgId !== auth.orgId)
    return apiError({ status: 404, code: "NOT_FOUND", message: "Not found" });
  return ok({ count });
}
