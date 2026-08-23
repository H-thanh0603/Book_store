import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api";
import { checkoutStorefrontOrder, listStorefrontProducts } from "@/lib/storefront";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    // Public endpoint — throttle per IP so scrapes/abuse can't hammer the search.
    await enforceRateLimit("storefront-catalog", clientIp(req.headers), 60, 60_000);
    return ok(await listStorefrontProducts({
      q: req.nextUrl.searchParams.get("q"),
      categoryId: req.nextUrl.searchParams.get("categoryId"),
      storeId: req.nextUrl.searchParams.get("storeId"),
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit("storefront-checkout", clientIp(req.headers), 10, 60_000);
    const order = await checkoutStorefrontOrder(await req.json());
    return ok({ number: order.number, status: order.status, total: Number(order.total) }, 201);
  } catch (error) {
    return apiError(error);
  }
}
