import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

/**
 * Browser return from ZaloPay. The redirect carries NO signature, so this
 * route NEVER settles — only the signed IPN does. It redirects to the
 * cosmetic result page with the order number; the IPN flips it to PAID
 * asynchronously (or the shopper retries from tracking).
 */
export async function GET(req: NextRequest) {
  const url = new URL("/shop/payment/callback", req.url);
  try {
    await enforceRateLimit("zalopay-return", clientIp(req.headers), 30, 60_000);
    const appTransId = req.nextUrl.searchParams.get("apptransid") ?? "";
    const orderId = appTransId.includes("_") ? appTransId.split("_").slice(1).join("_") : "";
    url.searchParams.set("code", "pending");
    if (orderId) url.searchParams.set("txn", orderId);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "zalopay_return_error", message: (err as { message?: string }).message }));
    url.searchParams.set("code", "99");
  }
  return NextResponse.redirect(url, 303);
}
