"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, Mail, Lock, Store, AlertCircle, Loader2, ArrowRight } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "signup", orgName, email, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.message ?? `HTTP ${r.status}`); return; }
      router.push("/dashboard");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <BookOpen className="w-8 h-8 text-indigo-600" />
          <span className="text-xl font-bold text-slate-800">Melio Bookstore</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h1 className="text-xl font-bold text-slate-900 mb-1">Tạo cửa hàng miễn phí</h1>
          <p className="text-xs text-slate-500 mb-5">Dùng thử 14 ngày. Không cần thẻ tín dụng.</p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tên cửa hàng / công ty</label>
              <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500/20">
                <Store className="w-4 h-4 text-slate-400" />
                <input
                  className="flex-1 outline-none text-sm"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Nhà sách Cá Chép"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email chủ cửa hàng</label>
              <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500/20">
                <Mail className="w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  className="flex-1 outline-none text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@casach.vn"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mật khẩu (tối thiểu 10 ký tự)</label>
              <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500/20">
                <Lock className="w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  className="flex-1 outline-none text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={10}
                />
              </div>
            </div>
          </div>

          {err && (
            <div className="mt-3 flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-xs">
              <AlertCircle className="w-3.5 h-3.5" /> {err}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading || !orgName || !email || password.length < 10}
            className="mt-4 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-700 text-white font-semibold rounded-lg text-sm inline-flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Tạo cửa hàng <ArrowRight className="w-4 h-4" /></>}
          </button>

          <div className="mt-4 text-center text-xs text-slate-500">
            Đã có tài khoản? <Link href="/login" className="text-indigo-600 hover:underline font-semibold">Đăng nhập</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
