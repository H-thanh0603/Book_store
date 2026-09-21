// Storefront wishlist — server-backed for logged-in customers, localStorage
// fallback for guests. On login the guest list merges into the server list.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Wish = { id: string; variantId?: string; name: string; price: number };
type ServerWish = {
  id: string; variantId: string; productName: string; variantName: string;
};

export default function WishlistPage() {
  const [items, setItems] = useState<Wish[]>([]);
  const [serverItems, setServerItems] = useState<ServerWish[] | null>(null);

  useEffect(() => {
    // Guest list from localStorage (drawer writes `bs_wishlist`).
    try {
      const raw = localStorage.getItem("bs_wishlist");
      if (raw) setItems(JSON.parse(raw) as Wish[]);
    } catch { /* ignore corrupt localStorage */ }
    // Server list when logged in — 401 means guest, keep local only.
    fetch("/api/storefront/wishlist").then(async (r) => {
      if (!r.ok) { setServerItems(null); return; }
      const d = await r.json();
      setServerItems((d.items as ServerWish[]) ?? []);
    }).catch(() => setServerItems(null));
  }, []);

  async function removeServer(id: string) {
    const row = serverItems?.find((s) => s.id === id);
    if (!row) return;
    const r = await fetch("/api/storefront/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId: row.variantId }),
    });
    if (r.ok) setServerItems((prev) => (prev ?? []).filter((s) => s.id !== id));
  }

  async function clearServer() {
    const r = await fetch("/api/storefront/wishlist", { method: "DELETE" });
    if (r.ok) setServerItems([]);
  }

  function clearLocal() {
    localStorage.removeItem("bs_wishlist");
    setItems([]);
  }

  // Logged-in view: server list is the source of truth.
  if (serverItems !== null) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-2xl text-slate-900">Sách yêu thích</h1>
          {serverItems.length > 0 ? (
            <button onClick={clearServer} className="text-xs text-rose-700 font-serif">Xóa hết</button>
          ) : null}
        </div>
        {serverItems.length === 0 ? (
          <div className="rounded-2xl border border-[#ede5d8] bg-white p-6 text-sm text-slate-500">
            Bạn chưa thêm sách nào vào danh sách yêu thích.{" "}
            <Link href="/shop" className="text-[#8c2d19] underline">Khám phá sách</Link>.
          </div>
        ) : (
          <ul className="space-y-2">
            {serverItems.map((it) => (
              <li key={it.id} className="rounded-2xl border border-[#ede5d8] bg-white p-3 flex items-center justify-between text-sm">
                <span>{it.productName}{it.variantName ? ` — ${it.variantName}` : ""}</span>
                <button onClick={() => removeServer(it.id)} className="text-xs text-rose-700">Bỏ thích</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl text-slate-900">Sách yêu thích</h1>
        {items.length > 0 ? (
          <button onClick={clearLocal} className="text-xs text-rose-700 font-serif">Xóa hết</button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-[#ede5d8] bg-white p-6 text-sm text-slate-500">
          Bạn chưa thêm sách nào vào danh sách yêu thích.{" "}
          <Link href="/shop" className="text-[#8c2d19] underline">Khám phá sách</Link>.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-2xl border border-[#ede5d8] bg-white p-3 flex items-center justify-between text-sm">
              <span>{it.name}</span>
              <b className="text-[#1c1917]">{it.price.toLocaleString("vi-VN")} ₫</b>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-slate-400">
        <Link href="/shop/account" className="underline">Đăng nhập</Link> để đồng bộ danh sách lên tài khoản.
      </p>
    </div>
  );
}
