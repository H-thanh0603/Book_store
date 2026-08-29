// Storefront wishlist. The drawer version lives in
// src/app/shop/_components/ShopOverlays.tsx and persists to localStorage
// for guests. DB-backed wishlist per customer is a follow-up — this
// page exists so the link from /shop/account resolves to a meaningful
// page and the customer can manage their list once they log in.
//
// ponytail: intentional stub. The full server-backed wishlist will land
// in a later phase; until then, redirecting the customer to the
// existing drawer is the least surprising thing.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Wish = { id: string; name: string; price: number };

export default function WishlistPage() {
  const [items, setItems] = useState<Wish[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("bs_wishlist");
      if (raw) setItems(JSON.parse(raw) as Wish[]);
    } catch { /* ignore corrupt localStorage */ }
  }, []);

  function clear() {
    localStorage.removeItem("bs_wishlist");
    setItems([]);
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl text-slate-900">Sách yêu thích</h1>
        {items.length > 0 ? (
          <button onClick={clear} className="text-xs text-rose-700 font-serif">Xóa hết</button>
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
      <p className="text-[10px] text-slate-400">
        Danh sách hiện lưu trên trình duyệt. Đồng bộ lên tài khoản sẽ có trong bản cập nhật tiếp theo.
      </p>
    </div>
  );
}
