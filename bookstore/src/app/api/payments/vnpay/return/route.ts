import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { settleVnpayResponse } from "@/lib/vnpay";

/**
 * Browser return from VNPay. Settles with the same verified handler as the IPN
 * (whichever lands first wins; the other is a duplicate-safe no-op), then
 * redirects to the cosmetic result page.
 *
 * Hardened like the IPN route: per-IP rate limit, and any unexpected error
 * (unset VNP_HASH_SECRET, malformed signed amount) degrades to a failure
 * redirect instead of a bare 500 page for the shopper.
 */
export async function GET(req: NextRequest) {
  const url = new URL("/shop/payment/callback", req.url);
  try {
    await enforceRateLimit("vnpay-return", clientIp(req.headers), 30, 60_000);
    const result = await settleVnpayResponse(req.nextUrl.searchParams);
    url.searchParams.set("code", result.rspCode);
    const number = req.nextUrl.searchParams.get("vnp_OrderInfo")?.replace(/^Thanh toan /, "");
    if (number) url.searchParams.set("number", number);
  } catch (err) {
    const e = err as { message?: string };
    console.error(JSON.stringify({ level: "error", event: "vnpay_return_error", message: e.message }));
    url.searchParams.set("code", "99"); // non-"00" → callback page renders "chưa hoàn tất"
  }
  return NextResponse.redirect(url, 303);
}
