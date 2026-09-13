import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { settleMomoResponse } from "@/lib/momo";

/**
 * Browser return from MoMo. Settles with the same verified handler as the IPN
 * (whichever lands first wins; the other is a duplicate-safe no-op), then
 * redirects to the cosmetic result page — same shape as the VNPay return.
 * Unexpected errors degrade to a failure redirect, never a bare 500.
 */
export async function GET(req: NextRequest) {
  const url = new URL("/shop/payment/callback", req.url);
  try {
    await enforceRateLimit("momo-return", clientIp(req.headers), 30, 60_000);
    const result = await settleMomoResponse(req.nextUrl.searchParams);
    url.searchParams.set("code", result.settled === "PAID" ? "00" : result.rspCode);
    const number = req.nextUrl.searchParams.get("orderInfo")?.replace(/^Thanh toan /, "");
    if (number) url.searchParams.set("number", number);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "momo_return_error", message: (err as { message?: string }).message }));
    url.searchParams.set("code", "99");
  }
  return NextResponse.redirect(url, 303);
}
