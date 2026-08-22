"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";

type Card = {
  id: string; code: string; initialValue: number; balance: number;
  active: boolean; expiresAt: string | null; createdAt: string;
};
type Count = {
  id: string; number: string; status: string; createdAt: string;
  items: { id: string; variantId: string; expectedQty: number; countedQty: number }[];
};
type SupplierReturn = {
  id: string; number: string; status: string;
  supplier: { name: string };
  items: { id: string; quantity: number; variant: { sku: string } }[];
};

export default function GiftCardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [counts, setCounts] = useState<Count[]>([]);
  const [sreturns, setSreturns] = useState<SupplierReturn[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [issue, setIssue] = useState({ amount: "", code: "" });
  const [op, setOp] = useState({ code: "", amount: "" });

  async function load() {
    const g = await fetch("/api/gift-cards"); if (g.ok) setCards((await g.json()).cards);
    const c = await fetch("/api/inventory-counts"); if (c.ok) setCounts((await c.json()).counts);
    const s = await fetch("/api/supplier-returns"); if (s.ok) setSreturns((await s.json()).returns);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(() => { load(); }, []);

  async function createCard() {
    const r = await fetch("/api/gift-cards", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(issue.amount), code: issue.code || undefined }),
    });
    const d = await r.json();
    setMsg(r.ok ? `✅ Đã phát hành ${d.code}` : "❌ " + d.message);
    if (r.ok) { setIssue({ amount: "", code: "" }); load(); }
  }

  async function patch(action: "adjust" | "deactivate") {
    const r = await fetch("/api/gift-cards", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: op.code, action,
        ...(action === "adjust" ? { amount: Number(op.amount) } : {}),
      }),
    });
    const d = await r.json();
    setMsg(r.ok
      ? action === "adjust" ? `✅ ${d.code}: số dư mới ${d.balance.toLocaleString("vi-VN")}₫` : `✅ ${d.code} đã vô hiệu`
      : "❌ " + d.message);
    if (r.ok) load();
  }

  async function postCount(c: Count) {
    if (!window.confirm(`Duyệt kiểm kê ${c.number}? Tồn kho sẽ được điều chỉnh theo chênh lệch.`)) return;
    const r = await fetch("/api/inventory-counts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventoryCountId: c.id }),
    });
    const d = await r.json();
    setMsg(r.ok ? `✅ ${c.number}: ${d.status}` : "❌ " + d.message);
    if (r.ok) load();
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="p-6 grid grid-cols-[380px_1fr] gap-6 items-start">
        <section className="space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
            <h2 className="font-bold">Phát hành gift card</h2>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Mệnh giá (₫)"
              value={issue.amount} onChange={(e) => setIssue({ ...issue, amount: e.target.value })} />
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Mã (bỏ trống = tự sinh)"
              value={issue.code} onChange={(e) => setIssue({ ...issue, code: e.target.value })} />
            <button onClick={createCard} disabled={!Number(issue.amount)}
              className="bg-blue-600 disabled:bg-slate-300 text-white rounded px-4 py-2 w-full">Phát hành</button>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
            <h2 className="font-bold">Điều chỉnh / vô hiệu</h2>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Mã GC"
              value={op.code} onChange={(e) => setOp({ ...op, code: e.target.value })} />
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="+/- số tiền (₫)"
              value={op.amount} onChange={(e) => setOp({ ...op, amount: e.target.value })} />
            <div className="flex gap-2">
              <button onClick={() => patch("adjust")} disabled={!op.code || op.amount === ""}
                className="flex-1 bg-green-600 disabled:bg-slate-300 text-white rounded py-2 text-sm">Điều chỉnh</button>
              <button onClick={() => patch("deactivate")} disabled={!op.code}
                className="flex-1 border disabled:text-slate-300 rounded py-2 text-sm hover:bg-red-50">Vô hiệu</button>
            </div>
          </div>
          {msg && <p className="text-sm">{msg}</p>}
        </section>

        <section className="space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm overflow-x-auto">
            <h2 className="font-bold mb-3">Gift cards ({cards.length})</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b"><th className="p-2">Mã</th><th>Số dư</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="p-2 font-medium">{c.code}</td>
                    <td>{c.balance.toLocaleString("vi-VN")}₫</td>
                    <td>{c.active ? <span className="text-green-700">Hoạt động</span> : <span className="text-slate-400">Vô hiệu</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm overflow-x-auto">
            <h2 className="font-bold mb-3">Kiểm kê chờ duyệt ({counts.filter((c) => c.status === "DRAFT").length})</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b"><th className="p-2">Số</th><th>Món lệch</th><th></th></tr></thead>
              <tbody>
                {counts.map((c) => {
                  const diffs = c.items.filter((i) => i.expectedQty !== i.countedQty);
                  return (
                    <tr key={c.id} className="border-b align-top">
                      <td className="p-2 font-medium">{c.number}<br /><span className="text-xs text-slate-400">{c.status}</span></td>
                      <td>{diffs.length === 0 ? "khớp" : diffs.map((i) => `${i.variantId.slice(0, 8)}… ${i.expectedQty}→${i.countedQty}`).join(", ")}</td>
                      <td>{c.status === "DRAFT" && (
                        <button onClick={() => postCount(c)} className="text-blue-600 hover:underline whitespace-nowrap">Duyệt &amp; post</button>
                      )}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm overflow-x-auto">
            <h2 className="font-bold mb-3">Trả NCC — phiếu thu (credit note)</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b"><th className="p-2">Số</th><th>NCC</th><th>Số món</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {sreturns.map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="p-2 font-medium">{s.number}</td>
                    <td>{s.supplier?.name}</td>
                    <td>{s.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                    <td>{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sreturns.length === 0 && <p className="text-sm text-slate-500 mt-2">Chưa có phiếu trả NCC.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
