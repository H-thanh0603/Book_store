// Storefront wishlist — server-backed, per customer session.
// P4-2: replaces the localStorage-only drawer. GET lists, POST toggles
// (add/remove by variantId), DELETE clears. Gated by `bs_customer` cookie.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireCustomerAuth } from "@/lib/customer-auth";
import { apiError, fail, ok } from "@/lib/api";

const ITEM_INCLUDE = {
  variant: {
    select: {
      id: true, sku: true, name: true,
      product: { select: { id: true, name: true, imageUrl: true } },
    },
  },
} as const;

export async function GET(_req: NextRequest) {
  try {
    const auth = await requireCustomerAuth();
    const items = await prisma.wishlistItem.findMany({
      where: { customerId: auth.customerId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: ITEM_INCLUDE,
    });
    return ok({
      items: items.map((i) => ({
        id: i.id,
        variantId: i.variantId,
        sku: i.variant.sku,
        variantName: i.variant.name,
        productId: i.variant.product.id,
        productName: i.variant.product.name,
        imageUrl: i.variant.product.imageUrl,
        createdAt: i.createdAt,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireCustomerAuth();
    const body = await req.json().catch(() => ({}));
    const variantId = typeof body?.variantId === "string" ? body.variantId : "";
    if (!variantId) fail(400, "VALIDATION", "variantId required");
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, active: true },
      select: { id: true },
    });
    if (!variant) fail(404, "NOT_FOUND", "Variant not found");
    // Toggle: already wished → remove (idempotent for double-taps).
    const existing = await prisma.wishlistItem.findUnique({
      where: { customerId_variantId: { customerId: auth.customerId, variantId } },
    });
    if (existing) {
      await prisma.wishlistItem.delete({ where: { id: existing.id } });
      return ok({ wished: false });
    }
    await prisma.wishlistItem.create({ data: { customerId: auth.customerId, variantId } });
    return ok({ wished: true }, 201);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const auth = await requireCustomerAuth();
    const cleared = await prisma.wishlistItem.deleteMany({ where: { customerId: auth.customerId } });
    return ok({ cleared: cleared.count });
  } catch (err) {
    return apiError(err);
  }
}
