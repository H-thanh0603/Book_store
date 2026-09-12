import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api";
import { checkoutStorefrontOrder, listStorefrontProducts } from "@/lib/storefront";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { agentRateLimit, finishAgentCall, type ResolvedAgentKey } from "@/lib/agent-auth";
import { withCheckoutSlot } from "@/lib/throttle";
import { observeRequest } from "@/lib/metrics";

// k6 benchmarks run all VUs through one IP, so the per-IP limiter (correct in
// production) would cap them at 60 req/min and the run measures 429s, not the
// app. LOADTEST_MODE=1 skips the limiter on this public route ONLY — it must
// never be set in production (check-alerts.ts alerts if it is).
const loadtest = process.env.LOADTEST_MODE === "1";

export async function GET(req: NextRequest) {
  const started = Date.now();
  let agentKey: ResolvedAgentKey | null = null;
  try {
    // Public endpoint — keyed agents get their own quota, everyone else
    // shares the per-IP bucket so scrapes can't hammer the search.
    if (!loadtest) agentKey = await agentRateLimit(req, "search_products", "storefront-catalog", 60);
    // Cache at the edge: browser 15s, CDN (Cloudflare) 30s, plus stale-while-revalidate
    // so a cold origin never stalls shoppers. Response varies ONLY on the query string
    // (no auth/cookies on this endpoint), so CDNs can key on the full URL safely.
    const response = ok(await listStorefrontProducts({
      q: req.nextUrl.searchParams.get("q"),
      categoryId: req.nextUrl.searchParams.get("categoryId"),
      storeId: req.nextUrl.searchParams.get("storeId"),
    }), 200, {
      "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
      Vary: "Accept-Encoding",
    });
    observeRequest("/api/storefront", "GET", response.status, Date.now() - started);
    await finishAgentCall(req, "search_products", agentKey, started);
    return response;
  } catch (error) {
    observeRequest("/api/storefront", "GET", (error as { status?: number }).status ?? 500, Date.now() - started);
    await finishAgentCall(req, "search_products", agentKey, started, error);
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    // Public endpoint — 10 checkouts/min/IP. Skipped under LOADTEST_MODE=1
    // (benchmark concession; see the comment at the top of this file).
    if (!loadtest) await enforceRateLimit("storefront-checkout", clientIp(req.headers), 10, 60_000);
    // System-wide concurrency cap so a flash sale doesn't saturate the DB pool
    // or double-fire the payment gateway.
    const body = await req.json();
    const order = await withCheckoutSlot(async () => checkoutStorefrontOrder(body, {
      ip: clientIp(req.headers),
      baseUrl: req.nextUrl.origin,
    }));
    const response = ok(
      { number: order.number, status: order.status, total: Number(order.total), paymentUrl: (order as { paymentUrl?: string }).paymentUrl },
      201,
    );
    observeRequest("/api/storefront", "POST", 201, Date.now() - started);
    return response;
  } catch (error) {
    observeRequest("/api/storefront", "POST", (error as { status?: number }).status ?? 500, Date.now() - started);
    return apiError(error);
  }
}
