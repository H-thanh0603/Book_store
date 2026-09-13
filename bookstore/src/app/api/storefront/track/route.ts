import { NextRequest } from "next/server";
import { apiError, fail, ok } from "@/lib/api";
import { trackStorefrontOrder } from "@/lib/storefront";
import { agentRateLimit, finishAgentCall, type ResolvedAgentKey } from "@/lib/agent-auth";

/**
 * Public delivery tracking. Two-factor lookup: the exact order number AND the
 * phone recorded on the order must both match — knowing one alone reveals
 * nothing. The response carries fulfillment status only: no customer name,
 * phone or address ever leaves the system here.
 */

export async function GET(req: NextRequest) {
  const started = Date.now();
  let agentKey: ResolvedAgentKey | null = null;
  try {
    agentKey = await agentRateLimit(req, "track_order", "storefront-track", 20);
    const sp = req.nextUrl.searchParams;
    const number = (sp.get("number") ?? "").trim().toUpperCase();
    const phone = (sp.get("phone") ?? "").trim();
    if (!number || !phone)
      fail(400, "VALIDATION", "Both the order number and the ordering phone are required");

    // Ordered flow lives in lib/storefront.ts so the shopping agent backend
    // reuses the exact same two-factor check (fixed order, enforced server-side).
    const { order } = await trackStorefrontOrder({ number, phone });
    await finishAgentCall(req, "track_order", agentKey, started);
    return ok({ order });
  } catch (err) {
    await finishAgentCall(req, "track_order", agentKey, started, err);
    return apiError(err);
  }
}
