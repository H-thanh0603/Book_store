"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";

type Variant = { id: string; sku: string; product: { name: string } };
type Location = { id: string; name: string; type: string };
type Transfer = {
  id: string; number: string; status: string;
  fromLocation: { name: string } | null;
  toLocation: { name: string } | null;
  items: { variant: { sku: string } | null; quantity: number }[];
};

const NEXT: Record<string, string> = {
  REQUESTED: "APPROVED",
  APPROVED: "PICKING",
  PICKING: "IN_TRANSIT",
  IN_TRANSIT: "RECEIVED",
  RECEIVED: "COMPLETED",
};
const LABEL: Record<string, string> = {
  APPROVED: "Duyệt", PICKING: "Soạn hàng", IN_TRANSIT: "Xuất kho",
  RECEIVED: "Nhận hàng", COMPLETED: "Hoàn tất",
};

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState(5);
  const [items, setItems] = useState<{ variantId: string; quantity: number }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/transfers");
    if (r.ok) setTransfers((await r.json()).transfers);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void load();
    fetch("/api/refs?kind=locations").then(async (r) => r.ok && setLocations((await r.json()).locations));
    fetch("/api/refs?kind=variants").then(async (r) => r.ok && setVariants((await r.json()).variants));
  }, []);

  async function post(body: object) {
    const r = await fetch("/api/transfers", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json();
    setMsg(r.ok ? `✅ ${d.number} → ${d.status}` : "❌ " + d.message);
    if (r.ok) load();
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="p-6 grid grid-cols-[380px_1fr] gap-6 items-start">
        <section className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <h2 className="font-bold">Tạo điều chuyển</h2>
          <select className="border rounded px-2 py-1 w-full" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">— Từ kho —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="border rounded px-2 py-1 w-full" value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">— Đến kho —</option>
            {locations.filter((l) => l.id !== fromId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <div className="flex gap-2">
            <select className="border rounded px-2 py-1 flex-1" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">— Sản phẩm —</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.sku} · {v.product.name}</option>)}
            </select>
            <input type="number" className="border rounded px-2 py-1 w-20" value={qty} min={1}
              onChange={(e) => setQty(Number(e.target.value))} />
            <button className="border rounded px-3" onClick={() => {
              if (!variantId) return;
              setItems((xs) => [...xs, { variantId, quantity: qty }]);
            }}>Thêm</button>
          </div>
          <ul className="text-sm">
            {items.map((i, idx) => (
              <li key={idx} className="flex justify-between border-b py-1">
                <span>{variants.find((v) => v.id === i.variantId)?.sku}</span><span>×{i.quantity}</span>
              </li>
            ))}
          </ul>
          <button className="bg-blue-600 text-white rounded px-4 py-2 w-full disabled:bg-slate-300"
            disabled={!fromId || !toId || items.length === 0}
            onClick={() => post({ action: "create", fromLocationId: fromId, toLocationId: toId, items })}>
            Tạo điều chuyển
          </button>
          {msg && <p className="text-sm">{msg}</p>}
        </section>

        <section className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold mb-3">Danh sách điều chuyển</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="p-2">Số</th><th>Từ → Đến</th><th>Mặt hàng</th><th>Trạng thái</th><th></th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id} className="border-b align-top">
                  <td className="p-2 font-medium">{t.number}</td>
                  <td className="text-xs">{t.fromLocation?.name} → {t.toLocation?.name}</td>
                  <td className="text-xs">
                    {t.items.map((i, k) => <div key={k}>{i.variant?.sku} ×{i.quantity}</div>)}
                  </td>
                  <td><span className="text-xs bg-slate-100 rounded px-2 py-0.5">{t.status}</span></td>
                  <td>
                    {NEXT[t.status] && (
                      <button className="border rounded px-2 py-0.5 text-xs"
                        onClick={() => post({ action: "transition", transferId: t.id, to: NEXT[t.status] })}>
                        {LABEL[NEXT[t.status]] ?? NEXT[t.status]}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
