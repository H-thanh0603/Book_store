"use client";
import { useEffect, useState } from "react";

type Dash = {
  today: { revenue: number; transactions: number };
  month: { revenue: number; transactions: number };
  ordersMTD: number;
  customers: number;
  lowStock: { sku: string; name: string; loc: string; available: number }[];
  topProducts: { name: string; units: number; revenue: string }[];
};

export default function DashboardPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (r) => (r.ok ? setD(await r.json()) : setErr((await r.json()).message)))
      .catch(() => setErr("Failed to load"));
  }, []);

  if (err) return <p className="p-8 text-red-600">{err}</p>;
  if (!d) return <p className="p-8">Đang tải…</p>;

  const vnd = (n: number) => n.toLocaleString("vi-VN") + " ₫";

  return (
    <main className="min-h-screen bg-slate-100 p-8 space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[
          ["Doanh thu hôm nay", vnd(d.today.revenue)],
          ["Giao dịch hôm nay", String(d.today.transactions)],
          ["Doanh thu tháng", vnd(d.month.revenue)],
          ["Khách hàng", String(d.customers)],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <section className="bg-white rounded-xl p-4 shadow-sm">
        <h2 className="font-bold mb-2">⚠️ Sắp hết hàng</h2>
        {d.lowStock.length === 0 ? <p className="text-slate-500 text-sm">Không có.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th>SKU</th><th>Sản phẩm</th><th>Vị trí</th><th>Còn lại</th></tr></thead>
            <tbody>{d.lowStock.map((r) => (
              <tr key={r.sku + r.loc} className="border-t"><td>{r.sku}</td><td>{r.name}</td><td>{r.loc}</td><td className={r.available <= 0 ? "text-red-600 font-bold" : ""}>{r.available}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="bg-white rounded-xl p-4 shadow-sm">
        <h2 className="font-bold mb-2">🏆 Top sản phẩm trong tháng</h2>
        {d.topProducts.length === 0 ? <p className="text-slate-500 text-sm">Chưa có giao dịch.</p> : (
          <ul className="text-sm">{d.topProducts.map((p) => (
            <li key={p.name} className="flex justify-between border-t py-1"><span>{p.name}</span><span>{Number(p.units)} sp · {Number(BigInt(p.revenue)).toLocaleString("vi-VN")} ₫</span></li>
          ))}</ul>
        )}
      </section>
    </main>
  );
}
