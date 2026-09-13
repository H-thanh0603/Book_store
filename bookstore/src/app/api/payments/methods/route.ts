import { ok } from "@/lib/api";
import { vnpayConfigured } from "@/lib/vnpay";
import { momoConfigured } from "@/lib/momo";
import { zaloPayConfigured } from "@/lib/zalopay";

/**
 * Public payment-method discovery for the storefront checkout.
 * Returns only availability flags (never secrets) so the UI shows exactly
 * the gateways the backend can actually settle.
 */
export async function GET() {
  return ok({
    methods: [
      { code: "COD", label: "Tiền mặt (COD)", configured: true },
      { code: "VNPAY", label: "VNPay", configured: vnpayConfigured() },
      { code: "MOMO", label: "MoMo", configured: momoConfigured() },
      { code: "ZALOPAY", label: "ZaloPay", configured: zaloPayConfigured() },
    ],
  });
}
