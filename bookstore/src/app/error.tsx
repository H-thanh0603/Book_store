"use client";
import { AlertTriangle, RotateCw } from "lucide-react";
import { trackError } from "@/lib/error-tracking";
import { useEffect } from "react";

// Root error boundary (WS2.3): a crashed route shows a recovery card — never
// a blank page — and the error is shipped through the configured transports.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    trackError(error, "error", { component: "route", action: "error_boundary" });
  }, [error]);
  return (
    <main className="min-h-screen bg-[#faf7f2] pb-16 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-[#ede5d8] p-8 text-center space-y-4 shadow-xs">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-[#faf4ea] text-[#8c2d19] flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-bold text-slate-900 text-lg">Có lỗi xảy ra</h1>
          <p className="text-xs text-slate-500 mt-1">
            Trang này gặp sự cố khi tải. Nhấn thử lại — dữ liệu của bạn không bị ảnh hưởng.
          </p>
        </div>
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white text-sm font-bold transition-colors"
        >
          <RotateCw className="w-4 h-4" /> Thử lại
        </button>
      </div>
    </main>
  );
}
