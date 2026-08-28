"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  Store,
  Boxes,
  ArrowRight,
  AlertCircle,
  Loader2,
} from "lucide-react";

type Mode = "login" | "forgot" | "reset";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [resetToken, setResetToken] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  // Deep links: /login?reset=<token> opens the set-new-password form directly.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("reset");
    if (t) {
      setResetToken(t);
      setMode("reset");
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email, password }),
      });
      if (res.ok) {
        router.push("/");
      } else {
        const d = await res.json();
        setError(d.message ?? "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.");
      }
    } catch {
      setError("Không thể kết nối đến máy chủ.");
    } finally {
      setLoading(false);
    }
  }

  const demoAccounts = [
    { label: "Chủ hệ thống (Owner)", email: "owner@melio.vn", role: "Toàn quyền quản trị" },
    { label: "Quản lý chi nhánh (Store NH)", email: "manager.nh@melio.vn", role: "Quản lý kho & POS" },
    { label: "Thu ngân (Store NH)", email: "cashier.nh@melio.vn", role: "POS Bán hàng" },
  ];

  return (
    <div className="min-h-screen bg-[#1c1917] flex flex-col justify-center relative overflow-hidden selection:bg-[#8c2d19] selection:text-white">
      {/* Background glow accents */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#8c2d19]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#d97706]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Hero Section */}
          <div className="lg:col-span-7 space-y-6 text-white pr-0 lg:pr-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#8c2d19] flex items-center justify-center text-[#ffd56a] shadow-lg shadow-[#8c2d19]/30">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 text-white">
                  Melio Books
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#8c2d19]/20 text-[#ffd56a] border border-[#8c2d19]/40 font-mono">
                    Retail OS
                  </span>
                </h1>
                <p className="text-xs text-[#a8a29e] font-medium">Hệ thống quản trị bán lẻ sách &amp; phong cách sống</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
                Vận hành tinh gọn, <br />
                <span className="text-[#ffd56a]">
                  Bán hàng đa kênh liền mạch
                </span>
              </h2>
              <p className="text-[#a8a29e] text-sm leading-relaxed max-w-lg">
                Giải pháp toàn diện đồng bộ hóa điểm bán POS, tồn kho liên kho tức thời, điều chuyển hàng hóa và chăm sóc khách hàng thân thiết.
              </p>
              <Link href="/shop" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-indigo-50">
                Mở website mua hàng <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                <Store className="w-5 h-5 text-[#ffd56a] mb-1.5" />
                <p className="text-xs font-bold text-white">POS Siêu Tốc</p>
                <p className="text-[11px] text-[#a8a29e] mt-0.5">Thanh toán QR, giữ giỏ, tích điểm tức thì</p>
              </div>
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                <Boxes className="w-5 h-5 text-[#ffd56a] mb-1.5" />
                <p className="text-xs font-bold text-white">Kho Đa Điểm</p>
                <p className="text-[11px] text-[#a8a29e] mt-0.5">Kiểm soát tồn khả dụng, luân chuyển</p>
              </div>
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                <ShieldCheck className="w-5 h-5 text-[#ffd56a] mb-1.5" />
                <p className="text-xs font-bold text-white">Bảo Mật &amp; Audit</p>
                <p className="text-[11px] text-[#a8a29e] mt-0.5">Phân quyền chi tiết, lưu vết giao dịch</p>
              </div>
            </div>
          </div>

          {/* Right Auth Card */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#ede5d8]">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {mode === "login" ? "Đăng nhập tài khoản" : mode === "forgot" ? "Quên mật khẩu" : "Đặt lại mật khẩu"}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {mode === "login"
                    ? "Truy cập cổng làm việc Melio Bookstore"
                    : mode === "forgot"
                      ? "Nhập email để nhận link đặt lại mật khẩu"
                      : "Nhập mật khẩu mới cho tài khoản của bạn"}
                </p>
              </div>

              {notice && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center gap-2.5 text-xs text-emerald-700">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{notice}</span>
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200/80 flex items-center gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {mode !== "login" && (
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(null); setNotice(null); }}
                  className="text-xs font-semibold text-[#8c2d19] hover:text-[#7a2816] mb-3"
                >
                  ← Quay lại đăng nhập
                </button>
              )}

              {mode === "login" && (
              <form onSubmit={submit} className="space-y-4">
                <div>
                <label className="block text-xs font-semibold text-[#1c1917] mb-1.5">Email làm việc</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#574431] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    className="w-full bg-[#faf4ea] border border-[#ede5d8] rounded-xl pl-10 pr-3 py-2.5 text-sm text-[#1c1917] placeholder:text-[#574431]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
                      placeholder="ten@melio.vn"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                <label className="block text-xs font-semibold text-[#1c1917] mb-1.5">Mật khẩu</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#574431] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    className="w-full bg-[#faf4ea] border border-[#ede5d8] rounded-xl pl-10 pr-10 py-2.5 text-sm text-[#1c1917] placeholder:text-[#574431]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
                      placeholder="••••••••"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setError(null); setNotice(null); }}
                  className="text-xs font-medium text-[#574431] hover:text-[#8c2d19]"
                >
                    Quên mật khẩu?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#8c2d19] hover:bg-[#7a2816] disabled:bg-[#d6d3d1] text-white font-semibold py-2.5 rounded-xl shadow-md shadow-[#8c2d19]/20 flex items-center justify-center gap-2 text-sm transition-all hover:scale-[1.01]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang xác thực...
                    </>
                  ) : (
                    <>
                      Đăng nhập hệ thống
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
              )}

              {mode !== "login" && <ForgotResetForms mode={mode} token={resetToken} setError={setError} setNotice={setNotice} onDone={() => { setMode("login"); }} />}

              {/* Demo Account Quick Selectors — never rendered in production builds */}
              {process.env.NODE_ENV !== "production" && (
              <div className="mt-6 pt-5 border-t border-[#ede5d8]">
                <p className="text-[11px] font-semibold text-[#574431] uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#8c2d19]" />
                  Chọn nhanh tài khoản Demo:
                </p>
                <div className="space-y-1.5">
                  {demoAccounts.map((acc, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setEmail(acc.email);
                        setPassword("");
                      }}
                      className={`w-full text-left p-2 rounded-xl text-xs flex items-center justify-between border transition-all ${
                        email === acc.email
                          ? "bg-[#faf4ea] border-[#ede5d8] text-[#1c1917]"
                          : "bg-[#faf7f2] hover:bg-[#faf4ea] border-[#ede5d8] text-[#574431]"
                      }`}
                    >
                      <div>
                        <p className="font-semibold">{acc.label}</p>
                        <p className="text-[10px] text-slate-500">{acc.role}</p>
                      </div>
                      <span className="text-[10px] font-mono text-[#574431]/60">{acc.email}</span>
                    </button>
                  ))}
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ForgotResetForms({
  mode, token, setError, setNotice, onDone,
}: {
  mode: "forgot" | "reset";
  token: string;
  setError: (msg: string | null) => void;
  setNotice: (msg: string | null) => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const body = mode === "forgot"
        ? { action: "request_reset", email }
        : { action: "reset_password", token, newPassword };
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message ?? "Yêu cầu thất bại. Vui lòng thử lại.");
        return;
      }
      if (mode === "forgot") {
        // Generic by design — do not reveal whether the account exists.
        setNotice("Nếu email tồn tại trong hệ thống, link đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư.");
        onDone();
      } else {
        setNotice("Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.");
        onDone();
      }
    } catch {
      setError("Không thể kết nối đến máy chủ.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "forgot" && (
        <div>
          <label htmlFor="reset-email" className="block text-xs font-semibold text-slate-700 mb-1.5">Email làm việc</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="reset-email"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="ten@melio.vn"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
      )}
      {mode === "reset" && (
        <div>
          <label htmlFor="new-password" className="block text-xs font-semibold text-slate-700 mb-1.5">Mật khẩu mới</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="new-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="Tối thiểu 10 ký tự"
              type="password"
              required
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-xl shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 text-sm transition-all hover:scale-[1.01]"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "forgot" ? "Gửi link đặt lại" : "Đặt lại mật khẩu"}
      </button>
    </form>
  );
}
