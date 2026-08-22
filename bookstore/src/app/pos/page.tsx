"use client";
import { useEffect, useRef, useState } from "react";

type Product = {
  id: string; name: string;
  variants: { id: string; sku: string; prices: { amount: string }[] }[];
};
type Line = { variantId: string; sku: string; name: string; quantity: number; unitPrice: number };
type Customer = { id: string; code: string; name: string; phone: string; loyalty: { points: number } | null };
type Quote = { subtotal: number; discountTotal: number; redeemDiscount: number; redeemable: number; total: number; promos: { name: string; discountTotal: number }[] };
type HeldCart = { lines: Line[]; customerId: string | null; label: string };

const HELD_KEY = "pos.heldCarts";

function loadHeld(): HeldCart[] {
  try { return JSON.parse(localStorage.getItem(HELD_KEY) ?? "[]"); } catch { return []; }
}

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string>("");
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [refundNumber, setRefundNumber] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate localStorage on mount
    setHeld(loadHeld());
    fetch("/api/stores").then(async (r) => { if (r.ok) { const d = await r.json(); setStores(d.stores); if (d.stores[0]) setStoreId(d.stores[0].id); } });
    fetch("/api/products").then(async (r) => { if (r.ok) setProducts((await r.json()).products); });
    fetch("/api/customers").then(async (r) => { if (r.ok) setCustomers((await r.json()).customers); });
  }, []);

  // Server quote — the client never computes what it pays.
  useEffect(() => {
    if (!shiftId || lines.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuote(null); return;
    }
    const t = setTimeout(() => {
      fetch("/api/pos/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId, storeId, customerId: customerId || null, couponCode: couponCode || null, redeemPoints, items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) }),
      }).then(async (r) => { if (r.ok) setQuote(await r.json()); });
    }, 250);
    return () => clearTimeout(t);
  }, [lines, shiftId, storeId, customerId, couponCode, redeemPoints]);

  async function openShift() {
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

  async function closeShift() {
    const r = await fetch("/api/pos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close_shift", shiftId, closingCash: 0 }),
    });
    const d = await r.json();
    setMsg(r.ok
      ? `Đóng ca. Kỳ vọng ${d.expectedCash.toLocaleString("vi-VN")}₫, lệch ${d.variance.toLocaleString("vi-VN")}₫`
      : "❌ " + d.message);
    if (r.ok) setShiftId(null);
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

  const total = quote?.total ?? lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  async function pay(method: string, giftCardCode?: string) {
    const r = await fetch("/api/pos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sale", shiftId, storeId,
        customerId: customerId || undefined,
        redeemPoints: redeemPoints || undefined,
        couponCode: couponCode || undefined,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        payments: [{ method, amount: total, giftCardCode }],
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg(`✅ ${d.number} — ${d.total.toLocaleString("vi-VN")}₫ (tích ${d.loyaltyEarned}đ${d.discountTotal ? `, giảm ${d.discountTotal.toLocaleString("vi-VN")}₫` : ""})`);
      setLines([]); setRedeemPoints(0); setCouponCode(""); setCustomerId(""); searchRef.current?.focus();
    } else setMsg("❌ " + d.message);
  }

  function hold() {
    if (!lines.length) return;
    const label = window.prompt("Tên giỏ giữ (VD: khách chờ bạn):", `Hold ${new Date().toLocaleTimeString("vi-VN")}`);
    if (!label) return;
    const next = [...loadHeld(), { lines, customerId: customerId || null, label }];
    localStorage.setItem(HELD_KEY, JSON.stringify(next));
    setHeld(next); setLines([]); setRedeemPoints(0); setCouponCode(""); setCustomerId("");
  }

  function resume(i: number) {
    const h = held[i];
    setLines(h.lines); setCustomerId(h.customerId ?? "");
    const next = held.filter((_, j) => j !== i);
    localStorage.setItem(HELD_KEY, JSON.stringify(next));
    setHeld(next);
  }

  async function refund() {
    if (!refundNumber.trim()) return;
    if (!window.confirm(`Hoàn tiền toàn bộ giao dịch ${refundNumber}? Không thể hoàn tác.`)) return;
    const r = await fetch("/api/pos", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txNumber: refundNumber.trim(), shiftId, storeId }),
    });
    const d = await r.json();
    setMsg(r.ok ? `↩️ ${d.number} — hoàn ${d.total.toLocaleString("vi-VN")}₫` : "❌ " + d.message);
    if (r.ok) setRefundNumber("");
  }

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    p.variants.some((v) => v.sku.toLowerCase().includes(q.toLowerCase()))
  );
  const cust = customers.find((c) => c.id === customerId);

  return (
    <main className="min-h-screen bg-slate-100 p-6 grid grid-cols-[1fr_400px] gap-6">
      <div>
        {!shiftId ? (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="font-bold">Mở ca</h2>
            <select className="border rounded px-2 py-1" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={openShift} className="bg-blue-600 text-white rounded px-4 py-2">Open Shift (tiền đầu ca 500.000₫)</button>
            <div className="border-t pt-3 space-y-2">
              <input className="w-full border rounded px-3 py-2" placeholder="Số TXN cần hoàn tiền"
                value={refundNumber} onChange={(e) => setRefundNumber(e.target.value)} />
              <button disabled={!refundNumber.trim()} onClick={refund}
                className="bg-red-600 disabled:bg-slate-300 text-white rounded px-4 py-2">Hoàn tiền giao dịch</button>
            </div>
            {msg && <p className="text-sm">{msg}</p>}
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              <input ref={searchRef} autoFocus className="flex-1 border rounded px-3 py-2" placeholder="Tìm sản phẩm / SKU…"
                value={q} onChange={(e) => setQ(e.target.value)} />
              <button onClick={closeShift} className="border rounded px-3 text-sm hover:bg-slate-50">Đóng ca</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {filtered.map((p) => (
                <button key={p.id} onClick={() => addLine(p)}
                  className="bg-white rounded-lg p-3 text-left shadow-sm hover:bg-blue-50">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-slate-500">{Number(p.variants[0]?.prices[0]?.amount ?? 0n).toLocaleString("vi-VN")}₫ · {p.variants[0]?.sku}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <aside className="space-y-4">
        {held.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-bold text-sm mb-2">Giỏ đang giữ ({held.length})</h3>
            {held.map((h, i) => (
              <button key={i} onClick={() => resume(i)} className="block w-full text-left text-sm border rounded px-3 py-2 mb-1 hover:bg-blue-50">
                📋 {h.label} — {h.lines.length} món
              </button>
            ))}
          </div>
        )}
        <div className="bg-white rounded-xl p-4 shadow-sm h-fit">
          <h2 className="font-bold mb-3">Giỏ hàng</h2>
          {lines.map((l) => (
            <div key={l.variantId} className="flex justify-between text-sm border-b py-1 gap-2">
              <span className="truncate">{l.name} ×{l.quantity}</span>
              <span className="whitespace-nowrap flex gap-1">
                {(l.quantity * l.unitPrice).toLocaleString("vi-VN")}₫
                <button title="Bớt 1" onClick={() => setLines((ls) => ls.flatMap((x) => x.variantId === l.variantId ? (x.quantity > 1 ? [{ ...x, quantity: x.quantity - 1 }] : []) : [x]))}>−</button>
              </span>
            </div>
          ))}
          <select className="w-full border rounded px-2 py-1 mt-3 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Khách vãng lai</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone}){c.loyalty ? ` · ${c.loyalty.points}đ` : ""}</option>)}
          </select>
          {cust?.loyalty && cust.loyalty.points > 0 && (
            <label className="text-xs block mt-2">Dùng điểm (có {cust.loyalty.points}, 10.000₫/đ):
              <input type="number" min={0} max={cust.loyalty.points} className="w-full border rounded px-2 py-1"
                value={redeemPoints} onChange={(e) => setRedeemPoints(Math.max(0, Math.min(cust.loyalty!.points, Number(e.target.value) || 0)))} />
            </label>
          )}
          <input className="w-full border rounded px-2 py-1 mt-2 text-sm" placeholder="Mã giảm giá…"
            value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
          {quote && (
            <div className="text-sm mt-3 space-y-0.5">
              <div className="flex justify-between"><span>Tạm tính</span><span>{quote.subtotal.toLocaleString("vi-VN")}₫</span></div>
              {quote.discountTotal > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>{quote.promos.map((p) => p.name).join(", ") || "Giảm giá"}</span>
                  <span>−{quote.discountTotal.toLocaleString("vi-VN")}₫</span>
                </div>
              )}
              {quote.redeemDiscount > 0 && (
                <div className="flex justify-between text-green-700"><span>Dùng {quote.redeemable} điểm</span><span>−{quote.redeemDiscount.toLocaleString("vi-VN")}₫</span></div>
              )}
            </div>
          )}
          <p className="text-right font-bold mt-2 text-lg">Tổng: {total.toLocaleString("vi-VN")}₫</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button disabled={!lines.length} onClick={() => pay("CASH")}
              className="bg-green-600 disabled:bg-slate-300 text-white rounded py-2 text-sm">Tiền mặt</button>
            <button disabled={!lines.length} onClick={() => pay("QR")}
              className="bg-blue-600 disabled:bg-slate-300 text-white rounded py-2 text-sm">QR</button>
            <button disabled={!lines.length} onClick={hold}
              className="border disabled:text-slate-300 rounded py-2 text-sm">Giữ giỏ</button>
          </div>
          {msg && <p className="text-sm mt-3">{msg}</p>}
        </div>
      </aside>
    </main>
  );
}
