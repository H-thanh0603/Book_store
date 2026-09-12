// GET /api/storefront/quote — preview checkout totals without creating an order.
// Lets the checkout modal validate a coupon and show the real discount before
// the customer submits, so the number on the submit button always matches what
// the order will actually cost.
import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api";
import { quoteStorefrontOrder } from "@/lib/storefront";
import { agentRateLimit, finishAgentCall, type ResolvedAgentKey } from "@/lib/agent-auth";

export async function GET(req: NextRequest) {
  const started = Date.now();
  let agentKey: ResolvedAgentKey | null = null;
  try {
    // Generous limit — one preview per coupon keystroke debounce.
    agentKey = await agentRateLimit(req, "quote_order", "storefront-quote", 60);
    const response = ok(await quoteStorefrontOrder({
      storeId: req.nextUrl.searchParams.get("storeId"),
      couponCode: req.nextUrl.searchParams.get("couponCode"),
      fulfillment: req.nextUrl.searchParams.get("fulfillment") === "pickup" ? "pickup" : "delivery",
      address: req.nextUrl.searchParams.get("address"),
      items: (req.nextUrl.searchParams.get("items") ?? "")
        .split(",").filter(Boolean).map((chunk) => {
          const [variantId, quantity] = chunk.split(":");
          return { variantId, quantity: Number(quantity) || 0 };
        }).filter((item) => item.variantId && item.quantity > 0),
    }), 200, { "Cache-Control": "no-store" });
    await finishAgentCall(req, "quote_order", agentKey, started);
    return response;
  } catch (error) {
    await finishAgentCall(req, "quote_order", agentKey, started, error);
    return apiError(error);
  }
}
