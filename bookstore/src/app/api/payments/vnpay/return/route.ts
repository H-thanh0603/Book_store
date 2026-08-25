import { NextRequest, NextResponse } from "next/server";
import { settleVnpayResponse } from "@/lib/vnpay";

/**
 * Browser return from VNPay. Settles with the same verified handler as the IPN
 * (whichever lands first wins; the other is a duplicate-safe no-op), then
 * redirects to the cosmetic result page.
 */
export async function GET(req: NextRequest) {
  const result = await settleVnpayResponse(req.nextUrl.searchParams);
  const url = new URL("/shop/payment/callback", req.url);
  url.searchParams.set("code", result.rspCode);
  const number = req.nextUrl.searchParams.get("vnp_OrderInfo")?.replace(/^Thanh toan /, "");
  if (number) url.searchParams.set("number", number);
  return NextResponse.redirect(url, 303);
}
