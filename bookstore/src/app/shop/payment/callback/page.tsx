// VNPay return landing page. Cosmetic only — the server-side settle handler
// (/api/payments/vnpay/return + IPN) is the source of truth; this just renders
// the outcome and links to order tracking.
"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CircleCheck, CircleX } from "lucide-react";

function CallbackResult() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const number = params.get("number");
  const paid = code === "00";

  return (
    <main className="min-h-screen bg-[#faf7f2] flex items-center justify-center p-4 font-serif">
      <div className="w-full max-w-md bg-[#fbf9f5] rounded-3xl border border-[#ede5d8] shadow-xl p-8 text-center space-y-4">
        {paid ? (
          <CircleCheck aria-hidden className="w-14 h-14 text-green-600 mx-auto" />
        ) : (
          <CircleX aria-hidden className="w-14 h-14 text-red-600 mx-auto" />
        )}
        <h1 className="text-2xl font-black text-slate-900">
          {paid ? "Thanh toán thành công!" : "Thanh toán chưa hoàn tất"}
        </h1>
        <p className="text-sm text-slate-600">
          {paid
            ? "Cảm ơn bạn đã mua sách tại cửa hàng. Đơn hàng đang được chuẩn bị."
            : "Giao dịch không thành công hoặc đã bị huỷ. Bạn có thể thử lại."}
        </p>
        {number && (
          <p className="text-xs text-slate-500">
            Mã đơn hàng: <b className="text-slate-800">{number}</b>
          </p>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <Link
            href="/shop"
            className="px-5 py-2.5 rounded-full bg-[#8c2d19] hover:bg-[#6f2413] text-white text-sm font-bold transition-colors"
          >
            Tiếp tục mua sắm
          </Link>
          {number && (
            <Link
              href="/track"
              className="px-5 py-2.5 rounded-full bg-white border border-[#ede5d8] hover:bg-slate-50 text-slate-700 text-sm font-bold transition-colors"
            >
              Tra cứu đơn hàng
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackResult />
    </Suspense>
  );
}
