// Provider-agnostic create. The storefront POSTs the orderId, the
// route loads the order, delegates to the adapter, and returns the
// deeplink URL for redirect.
//
// ponytail: only VNPay/MoMo/ZaloPay supported today. Adding a 4th
// provider means one branch in the switch + one lib.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { buildVnpayUrl } from "@/lib/vnpay";
import { buildMomoUrl, momoConfigured } from "@/lib/momo";
import { buildZaloPayUrl, zaloPayConfigured } from "@/lib/zalopay";

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    await requirePermission("orders.write");
    const body = (await req.json().catch(() => ({}))) as { orderId?: string };
    if (!body.orderId) return ok({ error: "VALIDATION", message: "orderId required" }, 400);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: body.orderId },
      select: { id: true, number: true, total: true },
    });
    const base = req.nextUrl.origin;
    let url: string;
    switch (provider) {
      case "vnpay":
        url = await buildVnpayUrl(order, req.headers.get("x-forwarded-for") ?? "0.0.0.0", base);
        break;
      case "momo":
        if (!momoConfigured()) return ok({ error: "VALIDATION", message: "MoMo not configured" }, 400);
        url = await buildMomoUrl(order, base);
        break;
      case "zalopay":
        if (!zaloPayConfigured()) return ok({ error: "VALIDATION", message: "ZaloPay not configured" }, 400);
        url = await buildZaloPayUrl(order, base);
        break;
      default:
        return ok({ error: "VALIDATION", message: `Unknown provider ${provider}` }, 400);
    }
    return NextResponse.json({ url });
  } catch (err) {
    return apiError(err);
  }
}
