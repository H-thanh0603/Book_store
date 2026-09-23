// Shipping estimate for the cart drawer (A3 growth).
// GET ?subtotal= — no address yet, so returns the DEFAULT zone fee +
// free-ship threshold from SystemConfig. Checkout quote stays authoritative;
// this only removes the "fee surprise" before the shopper commits.
import { NextRequest } from "next/server";
import { apiError, getSystemConfig, ok } from "@/lib/api";
import { quoteShipping } from "@/lib/shipping";
import { agentRateLimit, finishAgentCall, type ResolvedAgentKey } from "@/lib/agent-auth";

const loadtest = process.env.LOADTEST_MODE === "1";

export async function GET(req: NextRequest) {
  const started = Date.now();
  let agentKey: ResolvedAgentKey | null = null;
  try {
    if (!loadtest) agentKey = await agentRateLimit(req, "shipping_estimate", "storefront-catalog", 60);
    const subtotal = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("subtotal") ?? 0)));
    if (!Number.isFinite(subtotal)) return ok({ fee: 0, freeShip: false, threshold: 250000 });
    const q = await quoteShipping({ address: null, subtotal: BigInt(subtotal) });
    const threshold = await getSystemConfig<number>("shipping.freeThreshold", 250000);
    const response = ok(
      { fee: Number(q.fee), freeShip: q.freeShip, threshold },
      200,
      { "Cache-Control": "public, max-age=60, s-maxage=60" },
    );
    await finishAgentCall(req, "shipping_estimate", agentKey, started);
    return response;
  } catch (error) {
    await finishAgentCall(req, "shipping_estimate", agentKey, started, error);
    return apiError(error);
  }
}
