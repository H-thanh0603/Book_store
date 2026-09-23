// Funnel event sink (C retention): view_item / add_to_cart /
// begin_checkout / purchase from the shop. Batched client-side, counted
// server-side in the existing in-process metrics (observeRequest) so no new
// table/dependency. Rates come from /api/metrics counts.
import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api";
import { observeRequest } from "@/lib/metrics";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

const EVENTS = ["view_item", "add_to_cart", "begin_checkout", "purchase"] as const;

export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit("funnel", clientIp(req.headers), 120, 60_000);
    const body = await req.json().catch(() => ({}));
    const events = Array.isArray(body?.events) ? body.events : [body?.event];
    let counted = 0;
    for (const e of events.slice(0, 20)) {
      if (typeof e !== "string" || !(EVENTS as readonly string[]).includes(e)) continue;
      observeRequest(`/funnel/${e}`, "POST", 200, 0);
      counted++;
    }
    return ok({ counted });
  } catch (err) {
    return apiError(err);
  }
}
