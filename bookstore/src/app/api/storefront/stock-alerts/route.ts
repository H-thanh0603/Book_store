// Back-in-stock subscription for anonymous shoppers (A2 growth).
// POST { variantId, phone } — upserts a PENDING StockAlert; the
// shopper.notify job pings when the variant is back in stock.
// Phone-keyed (ShopperBell identity), rate-limited, org from the variant.
import { NextRequest } from "next/server";
import { apiError, fail, ok } from "@/lib/api";
import { prisma, prismaRead } from "@/lib/db";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { normalizeCartPhone } from "@/lib/server-cart";

export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit("stock-alert", clientIp(req.headers), 10, 60_000);
    const body = await req.json().catch(() => ({}));
    const variantId = typeof body?.variantId === "string" ? body.variantId : "";
    const phone = normalizeCartPhone(typeof body?.phone === "string" ? body.phone : "");
    if (!variantId) fail(400, "VALIDATION", "variantId required");
    if (!phone || phone.length < 9) fail(400, "VALIDATION", "Số điện thoại chưa đúng");
    const variant = await prismaRead.productVariant.findFirst({
      where: { id: variantId, active: true },
      select: { id: true, orgId: true, product: { select: { name: true } } },
    });
    if (!variant) fail(404, "NOT_FOUND", "Sản phẩm không tồn tại");
    await prisma.stockAlert.upsert({
      where: { orgId_phone_variantId: { orgId: variant.orgId, phone, variantId } },
      create: { orgId: variant.orgId, phone, variantId },
      update: { status: "PENDING", notifiedAt: null },
    });
    return ok({ subscribed: true, product: variant.product.name }, 201);
  } catch (err) {
    return apiError(err);
  }
}
