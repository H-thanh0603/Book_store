"use client";
import { useEffect, useState } from "react";

type Product = {
  id: string; name: string;
  variants: { id: string; sku: string; prices: { amount: string }[] }[];
};
type Line = { variantId: string; sku: string; name: string; quantity: number; unitPrice: number };

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string>("");
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/stores").then(async (r) => { if (r.ok) { const d = await r.json(); setStores(d.stores); if (d.stores[0]) setStoreId(d.stores[0].id); } });
    fetch("/api/products").then(async (r) => { if (r.ok) setProducts((await r.json()).products); });
  }, []);

  async function openShift() {
    // find terminal for store
    const res = await fetch("/api/terminals?storeId=" + storeId);
    const term = res.ok ? (await res.json()).terminals?.[0] : null;
    if (!term) { setMsg("Không có terminal"); return; }
    const r = await fetch("/api/pos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open_shift", terminalId: term.id, storeId, openingCash: 500000 }),
    });
    if (r.ok) setShiftId((await r.json()).shiftId);
    else setMsg((await r.json()).message);
  }

  function addLine(p: Product) {
    const v = p.variants[0];
    if (!v || !shiftId) return;
    setLines((ls) => {
      const ex = ls.find((l) => l.variantId === v.id);
      if (ex) return ls.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { variantId: v.id, sku: v.sku, name: p.name, quantity: 1, unitPrice: Number(v.prices[0]?.amount ?? 0n) }];
    });
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  async function pay(method: string) {
    const r = await fetch("/api/pos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sale", shiftId, storeId,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        payments: [{ method, amount: total }],
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg(`✅ ${d.number} — ${d.total.toLocaleString("vi-VN")}₫ (tích ${d.loyaltyEarned}đ)`);
      setLines([]);
    } else setMsg("❌ " + d.message);
  }

  const filtered = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <main className="min-h-screen bg-slate-100 p-6 grid grid-cols-[1fr_380px] gap-6">
      <div>
        {!shiftId ? (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="font-bold">Mở ca</h2>
            <select className="border rounded px-2 py-1" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={openShift} className="bg-blue-600 text-white rounded px-4 py-2">Open Shift (tiền đầu ca 500.000₫)</button>
            {msg && <p className="text-sm">{msg}</p>}
          </div>
        ) : (
          <>
            <input autoFocus className="w-full border rounded px-3 py-2 mb-4" placeholder="Tìm sản phẩm…"
              value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="grid grid-cols-3 gap-3">
              {filtered.map((p) => (
                <button key={p.id} onClick={() => addLine(p)}
                  className="bg-white rounded-lg p-3 text-left shadow-sm hover:bg-blue-50">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-slate-500">{Number(p.variants[0]?.prices[0]?.amount ?? 0n).toLocaleString("vi-VN")}₫</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <aside className="bg-white rounded-xl p-4 shadow-sm h-fit">
        <h2 className="font-bold mb-3">Giỏ hàng</h2>
        {lines.map((l) => (
          <div key={l.variantId} className="flex justify-between text-sm border-b py-1">
            <span>{l.name} ×{l.quantity}</span><span>{(l.quantity * l.unitPrice).toLocaleString("vi-VN")}₫</span>
          </div>
        ))}
        <p className="text-right font-bold mt-3">Tổng: {total.toLocaleString("vi-VN")}₫</p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button disabled={!lines.length} onClick={() => pay("CASH")}
            className="bg-green-600 disabled:bg-slate-300 text-white rounded py-2">Tiền mặt</button>
          <button disabled={!lines.length} onClick={() => pay("QR")}
            className="bg-blue-600 disabled:bg-slate-300 text-white rounded py-2">QR</button>
        </div>
        {msg && <p className="text-sm mt-3">{msg}</p>}
      </aside>
    </main>
  );
}
