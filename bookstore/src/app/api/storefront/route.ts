import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api";
import { checkoutStorefrontOrder, listStorefrontProducts } from "@/lib/storefront";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { withCheckoutSlot } from "@/lib/throttle";
import { observeRequest } from "@/lib/metrics";

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    // Public endpoint — throttle per IP so scrapes/abuse can't hammer the search.
    await enforceRateLimit("storefront-catalog", clientIp(req.headers), 60, 60_000);
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
    return response;
  } catch (error) {
    observeRequest("/api/storefront", "GET", (error as { status?: number }).status ?? 500, Date.now() - started);
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    await enforceRateLimit("storefront-checkout", clientIp(req.headers), 10, 60_000);
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
