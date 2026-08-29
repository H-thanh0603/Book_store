// Signup form. Pure client — calls /api/auth/signup then redirects
// to /dashboard. Mirrors the visual style of the storefront (cream
// ground, terracotta accent) so it feels like the same product.

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupForm() {
  const r = useRouter();
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgName, email, password, storeName: storeName || undefined }),
      });
      if (res.status === 201) {
        r.push("/dashboard");
        r.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? `Đăng ký thất bại (${res.status})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi mạng");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 font-serif">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Tên nhà sách *</label>
        <input
          required minLength={2} maxLength={80}
          value={orgName} onChange={(e) => setOrgName(e.target.value)}
          placeholder="VD: Nhà Sách Cá Chép"
          className="w-full bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Tên cửa hàng (mặc định: trụ sở)</label>
        <input
          value={storeName} onChange={(e) => setStoreName(e.target.value)}
          placeholder="VD: Cá Chép Quận 1"
          className="w-full bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Email chủ cửa hàng *</label>
        <input
          required type="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@casach.vn"
          className="w-full bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu (tối thiểu 10 ký tự) *</label>
        <input
          required minLength={10} type="password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
        />
      </div>
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">{error}</div>
      )}
      <button
        type="submit" disabled={submitting}
        className="w-full px-6 py-3 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm shadow-xl transition-all"
      >
        {submitting ? "Đang tạo..." : "Tạo tài khoản dùng thử 14 ngày"}
      </button>
      <p className="text-[11px] text-slate-500 text-center">
        Đã có tài khoản? <a href="/login" className="text-[#8c2d19] font-bold">Đăng nhập</a>
      </p>
    </form>
  );
}
