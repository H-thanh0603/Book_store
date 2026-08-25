import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { settleVnpayResponse } from "@/lib/vnpay";

/**
 * VNPay IPN (server-to-server callback). Response shape is owned by the VNPay
 * contract — plain JSON {RspCode, Message}, never ok()/apiError internals.
 */
export async function GET(req: NextRequest) {
  await enforceRateLimit("vnpay-ipn", clientIp(req.headers), 60, 60_000);
  const result = await settleVnpayResponse(req.nextUrl.searchParams);
  return NextResponse.json(
    { RspCode: result.rspCode, Message: result.message },
    { status: result.ok ? 200 : 400 },
  );
}
