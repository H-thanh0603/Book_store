"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";

type Variant = { id: string; sku: string; product: { name: string } };
type PO = {
  id: string; number: string; status: string;
  supplier: { name: string } | null;
  items: { variant: { id: string; sku: string } | null; quantity: number; unitCost: string; receivedQty: number }[];
};

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState(10);
  const [cost, setCost] = useState(50000);
  const [items, setItems] = useState<{ variantId: string; quantity: number; unitCost: number }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/purchase-orders");
    if (r.ok) setPos((await r.json()).purchaseOrders);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
    fetch("/api/refs?kind=suppliers").then(async (r) => r.ok && setSuppliers((await r.json()).suppliers));
    fetch("/api/refs?kind=warehouses").then(async (r) => r.ok && setWarehouses((await r.json()).warehouses));
    fetch("/api/refs?kind=variants").then(async (r) => r.ok && setVariants((await r.json()).variants));
  }, []);

  async function post(body: object) {
    const r = await fetch("/api/purchase-orders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json();
    setMsg(r.ok ? `✅ ${d.number ?? ""} ${d.status ?? ""}` : "❌ " + d.message);
    if (r.ok) load();
  }

  const vnd = (n: number) => n.toLocaleString("vi-VN") + "₫";

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="p-6 grid grid-cols-[380px_1fr] gap-6 items-start">
        <section className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <h2 className="font-bold">Tạo PO</h2>
          <select className="border rounded px-2 py-1 w-full" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— Nhà cung cấp —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="border rounded px-2 py-1 w-full" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">— Kho nhận —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div className="flex gap-2">
            <select className="border rounded px-2 py-1 flex-1" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">— Sản phẩm —</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.sku} · {v.product.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input type="number" className="border rounded px-2 py-1 w-20" value={qty} min={1}
              onChange={(e) => setQty(Number(e.target.value))} title="Số lượng" />
            <input type="number" className="border rounded px-2 py-1 flex-1" value={cost} min={0} step={1000}
              onChange={(e) => setCost(Number(e.target.value))} title="Đơn giá" />
            <button className="border rounded px-3" onClick={() => {
              if (!variantId) return;
              setItems((xs) => [...xs, { variantId, quantity: qty, unitCost: cost }]);
            }}>Thêm</button>
          </div>
          <ul className="text-sm">
            {items.map((i, idx) => (
              <li key={idx} className="flex justify-between border-b py-1">
                <span>{variants.find((v) => v.id === i.variantId)?.sku} ×{i.quantity}</span>
                <span>{vnd(i.unitCost * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <button className="bg-blue-600 text-white rounded px-4 py-2 w-full disabled:bg-slate-300"
            disabled={!supplierId || !warehouseId || items.length === 0}
            onClick={() => post({ action: "create", supplierId, warehouseId, items })}>
            Tạo PO
          </button>
          {msg && <p className="text-sm">{msg}</p>}
        </section>

        <section className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold mb-3">Danh sách PO</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="p-2">Số PO</th><th>NCC</th><th>Mặt hàng</th><th>Trạng thái</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr key={po.id} className="border-b align-top">
                  <td className="p-2 font-medium">{po.number}</td>
                  <td>{po.supplier?.name}</td>
                  <td className="text-xs">
                    {po.items.map((i, k) => (
                      <div key={k}>{i.variant?.sku} ×{i.quantity} (nhận {i.receivedQty}) · {vnd(Number(i.unitCost))}</div>
                    ))}
                  </td>
                  <td><span className="text-xs bg-slate-100 rounded px-2 py-0.5">{po.status}</span></td>
                  <td className="space-x-1 whitespace-nowrap">
                    {po.status === "pending_approval" && (
                      <button className="border rounded px-2 py-0.5 text-xs"
                        onClick={() => post({ action: "approve", poId: po.id })}>Duyệt</button>
                    )}
                    {["approved", "sent", "partially_received"].includes(po.status) && (
                      <button className="border rounded px-2 py-0.5 text-xs bg-green-50"
                        onClick={() => post({
                          action: "receive", poId: po.id,
                          items: po.items
                            .filter((i) => i.variant && i.receivedQty < i.quantity)
                            .map((i) => ({ variantId: i.variant!.id, quantity: i.quantity - i.receivedQty })),
                        })}>
                        Nhận đủ
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
