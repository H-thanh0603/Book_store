"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";

type Balance = {
  sku: string; product: string; location: string;
  onHand: number; reserved: number; available: number; inTransit: number; damaged: number;
};

export default function InventoryPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/inventory").then(async (r) => {
      const d = await r.json();
      if (r.ok) setBalances(d.balances); else setErr(d.message);
    });
  }, []);

  const filtered = balances.filter((b) =>
    (b.sku + b.product + b.location).toLowerCase().includes(q.toLowerCase()));

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="p-6 space-y-4">
        <input className="border rounded px-3 py-2 w-96" placeholder="Lọc theo SKU, sản phẩm, vị trí…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        {err && <p className="text-red-600">{err}</p>}
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="p-3">SKU</th><th>Sản phẩm</th><th>Vị trí</th>
                <th className="text-right">Tồn</th><th className="text-right">Giữ</th>
                <th className="text-right">Khả dụng</th><th className="text-right">Đang chuyển</th>
                <th className="text-right p-3">Hỏng</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => (
                <tr key={i} className="border-b">
                  <td className="p-3">{b.sku}</td>
                  <td>{b.product}</td>
                  <td>{b.location}</td>
                  <td className="text-right">{b.onHand}</td>
                  <td className="text-right">{b.reserved}</td>
                  <td className={"text-right font-medium " + (b.available <= 0 ? "text-red-600" : "")}>{b.available}</td>
                  <td className="text-right">{b.inTransit}</td>
                  <td className="text-right p-3">{b.damaged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
