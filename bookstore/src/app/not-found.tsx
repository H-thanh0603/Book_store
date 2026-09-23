import Link from "next/link";

// Branded 404 (audit Q96): every dead link gets a way home and a way to
// track an order — never a framework-default blank page.
export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#faf7f2] pb-16 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-[#ede5d8] p-8 text-center space-y-4 shadow-xs">
        <p className="font-serif text-5xl text-[#8c2d19]">404</p>
        <div>
          <h1 className="font-bold text-slate-900 text-lg">Không tìm thấy trang</h1>
          <p className="text-xs text-slate-500 mt-1">
            Liên kết có thể đã cũ hoặc gõ nhầm địa chỉ.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center px-5 py-2.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white text-sm font-bold transition-colors"
          >
            Về trang chủ
          </Link>
          <Link
            href="/track"
            className="inline-flex items-center px-5 py-2.5 rounded-2xl border border-[#ede5d8] text-sm font-bold text-slate-700 hover:bg-[#faf7f2] transition-colors"
          >
            Theo dõi đơn
          </Link>
        </div>
      </div>
    </main>
  );
}
