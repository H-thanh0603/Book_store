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
import { csrfHeaders } from "@/lib/csrf-client";

type AuthState =
  | { anonymous: true }
  | { customerId: string; email: string | null; phone: string; name: string };

type Member = {
  code: string;
  birthday: string | null;
  points: number;
  tier: string;
  transactions: { id: string; points: number; balanceAfter: number; type: string; createdAt: string }[];
};

// N4c: tier benefits table (single source: /api/loyalty/redeem-voucher).
function TierBenefits() {
  const [benefits, setBenefits] = useState<Record<string, string[]> | null>(null);
  useEffect(() => {
    fetch("/api/loyalty/redeem-voucher").then(async (r) => {
      if (r.ok) setBenefits((await r.json()).benefits);
    }).catch(() => {});
  }, []);
  if (!benefits) return null;
  return (
    <div className="rounded-2xl border border-[#ede5d8] bg-white p-4 space-y-3">
      <h2 className="font-serif font-bold text-base text-slate-900">Hạng thành viên &amp; quyền lợi</h2>
      {Object.entries(benefits).map(([tier, items]) => (
        <div key={tier} className="text-xs">
          <b className="text-[#8c2d19]">{tier}</b>
          <ul className="text-slate-600 mt-0.5 space-y-0.5">
            {items.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AccountInner() {
  const router = useRouter();
  const params = useSearchParams();
  const verifyToken = params.get("verify");

  const [tab, setTab] = useState<"login" | "signup">("login");
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const customerId = auth && !("anonymous" in auth) ? auth.customerId : null;

  // Auto-consume ?verify=... if present.
  useEffect(() => {
    if (!verifyToken) return;
    void (async () => {
      const res = await fetch("/api/storefront/auth", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await csrfHeaders()) },
        body: JSON.stringify({ action: "verify_email", token: verifyToken }),
      });
      const data = await res.json();
      if (res.ok && data?.verified) {
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
      setAuth(data ?? { anonymous: true });
    })();
  }, []);

  useEffect(() => {
    if (!customerId) { setMember(null); return; }
    void (async () => {
      const res = await fetch("/api/storefront/account");
      if (!res.ok) return;
      const data = await res.json();
      setMember(data.member ?? null);
    })();
  }, [customerId]);

  async function submitLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    const fd = new FormData(e.currentTarget);
    const identifier = String(fd.get("identifier") ?? "");
    const password = String(fd.get("password") ?? "");
    const res = await fetch("/api/storefront/auth", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify({ action: "login", identifier, password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data?.error?.message ?? "Đăng nhập thất bại"); return; }
    setAuth({ customerId: data.customerId, email: null, phone: identifier, name: "" });
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
    const birthday = String(fd.get("birthday") ?? "");
    const res = await fetch("/api/storefront/auth", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify({ action: "signup", name, email, phone, password, birthday: birthday || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data?.error?.message ?? "Đăng ký thất bại"); return; }
    setAuth({ customerId: data.customerId, email, phone, name });
    setMsg("Đăng ký thành công. Kiểm tra email để xác nhận.");
    router.refresh();
  }

  async function logout() {
    await fetch("/api/storefront/auth", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify({ action: "logout" }),
    });
    setAuth({ anonymous: true });
    router.refresh();
  }

  async function submitBirthday(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    const fd = new FormData(e.currentTarget);
    const birthday = String(fd.get("birthday") ?? "");
    const res = await fetch("/api/storefront/account", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify({ birthday: birthday || null }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data?.error?.message ?? "Lưu ngày sinh thất bại"); return; }
    setMember((m) => (m ? { ...m, birthday: data.birthday } : m));
    setMsg("Đã lưu ngày sinh — sinh nhật sẽ có quà!");
  }

  if (auth && !("anonymous" in auth)) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-4">
        <h1 className="font-serif text-2xl text-slate-900">Tài khoản của bạn</h1>
        <div className="rounded-2xl border border-[#ede5d8] bg-white p-4 space-y-1 text-sm">
          <div><b>{auth.name || auth.phone}</b></div>
          {auth.email ? <div className="text-slate-500">{auth.email}</div> : null}
        </div>
        {member ? (
          <section className="rounded-2xl border border-[#e8dac5] bg-[#faf4ea] p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#8c2d19] font-bold">Thẻ thành viên {member.code}</p>
                <p className="text-xs text-slate-600 mt-1">Hạng {member.tier}</p>
              </div>
              <b className="text-2xl text-[#8c2d19]">{member.points.toLocaleString("vi-VN")} <span className="text-xs">điểm</span></b>
            </div>
            {!member.birthday ? (
              <form onSubmit={submitBirthday} className="flex gap-2 items-center border-t border-[#e8dac5] pt-3">
                <input
                  name="birthday"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  aria-label="Ngày sinh nhận quà"
                  className="flex-1 min-w-0 rounded-xl border border-[#e8dac5] bg-white px-2.5 py-2 text-xs"
                />
                <button disabled={busy} className="shrink-0 px-3 py-2 rounded-xl bg-[#8c2d19] text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
                  🎂 Nhận quà SN
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-500 border-t border-[#e8dac5] pt-2">🎂 Sinh nhật {member.birthday} — sẽ có quà tự động!</p>
            )}
            {member.transactions.length > 0 ? (
              <div className="border-t border-[#e8dac5] pt-2 text-xs text-slate-600">
                Gần nhất: {member.transactions[0].points > 0 ? "+" : ""}{member.transactions[0].points} điểm ({member.transactions[0].type})
              </div>
            ) : <p className="text-xs text-slate-500">Điểm sẽ được cộng sau mỗi đơn hàng đủ điều kiện.</p>}
          </section>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link href="/shop/orders" className="px-4 py-2 rounded-2xl bg-[#8c2d19] hover:bg-[#7a2816] text-white text-xs font-bold shadow-xs">Lịch sử đơn hàng</Link>
          <Link href="/shop/wishlist" className="px-4 py-2 rounded-2xl border border-slate-200 bg-white text-slate-700 text-xs font-bold">Sách yêu thích</Link>
          <button onClick={logout} className="px-4 py-2 rounded-2xl border border-[#e8dac5] text-[#8c2d19] text-xs font-bold hover:bg-[#faf4ea] cursor-pointer">Đăng xuất</button>
        </div>
        <TierBenefits />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="font-serif font-black text-2xl text-slate-900">Tài khoản</h1>
      <div className="flex gap-2">
        <button
          onClick={() => { setTab("login"); setErr(null); setMsg(null); }}
          className={`flex-1 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${tab === "login" ? "bg-[#8c2d19] text-white shadow-xs" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
        >Đăng nhập</button>
        <button
          onClick={() => { setTab("signup"); setErr(null); setMsg(null); }}
          className={`flex-1 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${tab === "signup" ? "bg-[#8c2d19] text-white shadow-xs" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
        >Đăng ký</button>
      </div>

      {msg ? <div className="rounded-2xl bg-emerald-50 text-emerald-800 text-xs p-3">{msg}</div> : null}
      {err ? <div className="rounded-2xl bg-rose-50 text-rose-800 text-xs p-3">{err}</div> : null}

      {tab === "login" ? (
        <form onSubmit={submitLogin} className="space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            Email hoặc số điện thoại
            <input
              name="identifier"
              type="text"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Mật khẩu
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={10}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-[#8c2d19] hover:bg-[#7a2816] text-white text-sm font-bold shadow-md disabled:bg-slate-300 disabled:text-slate-500 cursor-pointer"
          >{busy ? "Đang xử lý..." : "Đăng nhập"}</button>
        </form>
      ) : (
        <form onSubmit={submitSignup} className="space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            Họ tên
            <input name="name" type="text" required maxLength={120} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20" />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Email
            <input name="email" type="email" required className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20" />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Số điện thoại
            <input name="phone" type="tel" required pattern="[0-9+\-\s()]{8,20}" className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20" />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Ngày sinh <span className="text-slate-400">(nhận quà sinh nhật hàng năm)</span>
            <input name="birthday" type="date" max={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20" />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Mật khẩu (tối thiểu 10 ký tự)
            <input name="password" type="password" required minLength={10} autoComplete="new-password" className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20" />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-[#8c2d19] hover:bg-[#7a2816] text-white text-sm font-bold shadow-md disabled:bg-slate-300 disabled:text-slate-500 cursor-pointer"
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
