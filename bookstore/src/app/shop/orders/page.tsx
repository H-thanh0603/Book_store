// Storefront order history. Fetches /api/storefront/orders on mount.
// Gated by the bs_customer cookie — if the customer isn't logged in,
// redirect to /shop/account.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Item = { id: string; name: string; quantity: number; price: string };
type Order = {
  id: string; number: string; status: string; total: string;
  createdAt: string; shipment: { status: string; trackingNumber: string | null } | null;
  items: Item[];
};

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/storefront/orders", { method: "GET" });
      if (res.status === 401) { router.replace("/shop/account"); return; }
      const data = await res.json();
      if (!res.ok) { setErr(data?.error?.message ?? "Không tải được đơn hàng"); return; }
      setOrders(data.data);
    })();
  }, [router]);

  if (err) return <div className="max-w-2xl mx-auto p-6 text-xs text-rose-700">{err}</div>;
  if (!orders) return <div className="max-w-2xl mx-auto p-6 text-xs text-slate-400">Đang tải...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="font-serif text-2xl text-slate-900">Đơn hàng của bạn</h1>
      {orders.length === 0 ? (
        <div className="rounded-2xl border border-[#ede5d8] bg-white p-6 text-sm text-slate-500">
          Bạn chưa có đơn hàng nào. <Link href="/shop" className="text-[#8c2d19] underline">Khám phá sách</Link>.
        </div>
      ) : orders.map((o) => (
        <div key={o.id} className="rounded-2xl border border-[#ede5d8] bg-white p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-serif font-bold text-sm">{o.number}</div>
            <span className="text-[10px] uppercase tracking-wider bg-[#faf7f2] text-slate-700 rounded-full px-2 py-0.5">{o.status}</span>
          </div>
          <ul className="text-xs text-slate-600 space-y-1">
            {o.items.map((it) => (
              <li key={it.id} className="flex justify-between">
                <span>{it.name} × {it.quantity}</span>
                <span>{Number(it.price).toLocaleString("vi-VN")} ₫</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{new Date(o.createdAt).toLocaleString("vi-VN")}</span>
            <b className="text-[#1c1917]">{Number(o.total).toLocaleString("vi-VN")} ₫</b>
          </div>
        </div>
      ))}
    </div>
  );
}
