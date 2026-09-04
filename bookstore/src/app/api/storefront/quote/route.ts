// GET /api/storefront/quote — preview checkout totals without creating an order.
// Lets the checkout modal validate a coupon and show the real discount before
// the customer submits, so the number on the submit button always matches what
// the order will actually cost.
import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api";
import { quoteStorefrontOrder } from "@/lib/storefront";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    // Generous limit — one preview per coupon keystroke debounce.
    await enforceRateLimit("storefront-quote", clientIp(req.headers), 60, 60_000);
    const response = ok(await quoteStorefrontOrder({
      storeId: req.nextUrl.searchParams.get("storeId"),
      couponCode: req.nextUrl.searchParams.get("couponCode"),
      items: (req.nextUrl.searchParams.get("items") ?? "")
        .split(",").filter(Boolean).map((chunk) => {
          const [variantId, quantity] = chunk.split(":");
          return { variantId, quantity: Number(quantity) || 0 };
        }).filter((item) => item.variantId && item.quantity > 0),
    }), 200, { "Cache-Control": "no-store" });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
