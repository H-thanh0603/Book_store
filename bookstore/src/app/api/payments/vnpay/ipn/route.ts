import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { settleVnpayResponse } from "@/lib/vnpay";
import { enqueueEinvoiceForOrder } from "@/lib/einvoice";

/**
 * VNPay IPN (server-to-server callback). Response shape is owned by the VNPay
 * contract — plain JSON {RspCode, Message}, never ok()/apiError internals.
 */
export async function GET(req: NextRequest) {
  await enforceRateLimit("vnpay-ipn", clientIp(req.headers), 60, 60_000);
  const result = await settleVnpayResponse(req.nextUrl.searchParams);
  if (result.ok && result.orderId) {
    enqueueEinvoiceForOrder(result.orderId).catch((err) =>
      console.error(JSON.stringify({ level: "error", event: "einvoice_enqueue_failed", orderId: result.orderId, message: err?.message }))
    );
  }
  return NextResponse.json(
    { RspCode: result.rspCode, Message: result.message },
    { status: result.ok ? 200 : 400 },
  );
}
