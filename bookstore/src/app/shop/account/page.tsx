// Storefront customer account: login / signup tabs, verify-email banner,
// logout. Single page (no client-side router) — server-renders the auth
// state, the form posts to /api/storefront/auth. If the customer is
// already logged in, render a tiny "hi, {name}" panel + logout instead
// of the forms.
//
// ponytail: reuses the staff UI primitives (input/button) — no design
// system work for a 2-tab form. Order history + wishlist are sibling
// pages, not nested.

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type AuthState =
  | { anonymous: true }
  | { customerId: string; email: string | null; phone: string; name: string };

function AccountInner() {
  const router = useRouter();
  const params = useSearchParams();
  const verifyToken = params.get("verify");

  const [tab, setTab] = useState<"login" | "signup">("login");
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Auto-consume ?verify=... if present.
  useEffect(() => {
    if (!verifyToken) return;
    void (async () => {
      const res = await fetch("/api/storefront/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify_email", token: verifyToken }),
      });
      const data = await res.json();
      if (res.ok && data?.data?.verified) {
        setMsg("Email đã được xác nhận. Cảm ơn bạn!");
        router.replace("/shop/account");
      } else {
        setErr("Link xác nhận không hợp lệ hoặc đã hết hạn.");
      }
    })();
  }, [verifyToken, router]);

  // Load current auth on mount.
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/storefront/auth", { method: "GET" });
      const data = await res.json();
      setAuth(data?.data ?? { anonymous: true });
    })();
  }, []);

  async function submitLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    const fd = new FormData(e.currentTarget);
    const identifier = String(fd.get("identifier") ?? "");
    const password = String(fd.get("password") ?? "");
    const res = await fetch("/api/storefront/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "login", identifier, password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data?.error?.message ?? "Đăng nhập thất bại"); return; }
    setAuth({ customerId: data.data.customerId, email: null, phone: identifier, name: "" });
    setMsg("Đăng nhập thành công.");
    router.refresh();
  }

  async function submitSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "");
    const email = String(fd.get("email") ?? "");
    const phone = String(fd.get("phone") ?? "");
    const password = String(fd.get("password") ?? "");
    const res = await fetch("/api/storefront/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "signup", name, email, phone, password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data?.error?.message ?? "Đăng ký thất bại"); return; }
    setAuth({ customerId: data.data.customerId, email, phone, name });
    setMsg("Đăng ký thành công. Kiểm tra email để xác nhận.");
    router.refresh();
  }

  async function logout() {
    await fetch("/api/storefront/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setAuth({ anonymous: true });
    router.refresh();
  }

  if (auth && !("anonymous" in auth)) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-4">
        <h1 className="font-serif text-2xl text-slate-900">Tài khoản của bạn</h1>
        <div className="rounded-2xl border border-[#ede5d8] bg-white p-4 space-y-1 text-sm">
          <div><b>{auth.name || auth.phone}</b></div>
          {auth.email ? <div className="text-slate-500">{auth.email}</div> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/shop/orders" className="px-4 py-2 rounded-2xl bg-[#1c1917] text-white text-xs font-serif">Lịch sử đơn hàng</Link>
          <Link href="/shop/wishlist" className="px-4 py-2 rounded-2xl border border-[#ede5d8] text-slate-700 text-xs font-serif">Sách yêu thích</Link>
          <button onClick={logout} className="px-4 py-2 rounded-2xl border border-rose-200 text-rose-700 text-xs font-serif">Đăng xuất</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="font-serif text-2xl text-slate-900">Tài khoản</h1>
      <div className="flex gap-2">
        <button
          onClick={() => { setTab("login"); setErr(null); setMsg(null); }}
          className={`flex-1 py-2 rounded-2xl text-xs font-serif font-bold ${tab === "login" ? "bg-[#1c1917] text-white" : "bg-white border border-[#ede5d8] text-slate-700"}`}
        >Đăng nhập</button>
        <button
          onClick={() => { setTab("signup"); setErr(null); setMsg(null); }}
          className={`flex-1 py-2 rounded-2xl text-xs font-serif font-bold ${tab === "signup" ? "bg-[#1c1917] text-white" : "bg-white border border-[#ede5d8] text-slate-700"}`}
        >Đăng ký</button>
      </div>

      {msg ? <div className="rounded-2xl bg-emerald-50 text-emerald-800 text-xs p-3">{msg}</div> : null}
      {err ? <div className="rounded-2xl bg-rose-50 text-rose-800 text-xs p-3">{err}</div> : null}

      {tab === "login" ? (
        <form onSubmit={submitLogin} className="space-y-3">
          <label className="block text-xs font-serif text-slate-600">
            Email hoặc số điện thoại
            <input
              name="identifier"
              type="text"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-2xl border border-[#ede5d8] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20"
            />
          </label>
          <label className="block text-xs font-serif text-slate-600">
            Mật khẩu
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={10}
              className="mt-1 w-full rounded-2xl border border-[#ede5d8] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-2xl bg-[#1c1917] text-white text-sm font-serif font-bold disabled:bg-slate-300 disabled:text-slate-700"
          >{busy ? "Đang xử lý..." : "Đăng nhập"}</button>
        </form>
      ) : (
        <form onSubmit={submitSignup} className="space-y-3">
          <label className="block text-xs font-serif text-slate-600">
            Họ tên
            <input name="name" type="text" required maxLength={120} className="mt-1 w-full rounded-2xl border border-[#ede5d8] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20" />
          </label>
          <label className="block text-xs font-serif text-slate-600">
            Email
            <input name="email" type="email" required className="mt-1 w-full rounded-2xl border border-[#ede5d8] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20" />
          </label>
          <label className="block text-xs font-serif text-slate-600">
            Số điện thoại
            <input name="phone" type="tel" required pattern="[0-9+\-\s()]{8,20}" className="mt-1 w-full rounded-2xl border border-[#ede5d8] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20" />
          </label>
          <label className="block text-xs font-serif text-slate-600">
            Mật khẩu (tối thiểu 10 ký tự)
            <input name="password" type="password" required minLength={10} autoComplete="new-password" className="mt-1 w-full rounded-2xl border border-[#ede5d8] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20" />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-2xl bg-[#1c1917] text-white text-sm font-serif font-bold disabled:bg-slate-300 disabled:text-slate-700"
          >{busy ? "Đang xử lý..." : "Tạo tài khoản"}</button>
        </form>
      )}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-slate-400">Đang tải...</div>}>
      <AccountInner />
    </Suspense>
  );
}
