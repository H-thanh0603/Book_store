"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";

type Product = {
  id: string; name: string;
  variants: { id: string; sku: string; prices: { amount: string }[] }[];
};
type Line = { variantId: string; name: string; quantity: number; unitPrice: number };
type Order = {
  id: string; number: string; channel: string; type: string; status: string;
  total: number; createdAt: string;
  customer: { name: string };
  items: { id: string; variantId: string; quantity: number; unitPrice: number }[];
};
const CART_KEY = "web.cart";

export default function OrdersPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [orderType, setOrderType] = useState("delivery");
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  async function loadOrders() {
    const r = await fetch("/api/orders");
    if (r.ok) setOrders((await r.json()).orders);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate cart from localStorage on mount
    try { setLines(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]")); } catch { /* fresh cart */ }
    fetch("/api/products").then(async (r) => { if (r.ok) setProducts((await r.json()).products); });
    fetch("/api/customers").then(async (r) => { if (r.ok) setCustomers((await r.json()).customers); });
    fetch("/api/stores").then(async (r) => { if (r.ok) setStores((await r.json()).stores); });
    loadOrders();
  }, []);
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(lines));
  }, [lines]);

  function addLine(p: Product) {
    const v = p.variants[0];
    if (!v) return;
    setLines((ls) => {
      const ex = ls.find((l) => l.variantId === v.id);
      if (ex) return ls.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { variantId: v.id, name: p.name, quantity: 1, unitPrice: Number(v.prices[0]?.amount ?? 0n) }];
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  async function checkout() {
    if (!customerId || !lines.length) return;
    if (orderType === "ship_from_store" && !storeId) { setMsg("❌ Chọn cửa hàng"); return; }
    const r = await fetch("/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "WEB", type: orderType,
        customerId,
        storeId: orderType !== "delivery" ? storeId : undefined,
        couponCode: couponCode || undefined,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg(`✅ Đã tạo ${d.number} (${d.status})`);
      setLines([]); setCouponCode(""); loadOrders();
    } else setMsg("❌ " + d.message);
  }

  async function fulfill(order: Order, action: "ship" | "collect" | "cancel") {
    const body: Record<string, unknown> = { orderId: order.id, action };
    if (action === "ship") Object.assign(body, {
      recipientName: order.customer.name, recipientPhone: "0000000000",
      address: window.prompt("Địa chỉ giao:") ?? "",
    });
    if (action === "cancel" && !window.confirm(`Huỷ đơn ${order.number}?`)) return;
    const r = await fetch("/api/fulfillment", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json();
    setMsg(r.ok ? `✅ ${order.number}: ${d.status}` : "❌ " + d.message);
    if (r.ok) loadOrders();
  }

  async function deliver(order: Order) {
    const r = await fetch("/api/fulfillment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id, action: "deliver" }),
    });
    const d = await r.json();
    setMsg(r.ok ? `✅ ${order.number}: ${d.status}` : "❌ " + d.message);
    if (r.ok) loadOrders();
  }

  async function createReturn(order: Order) {
    if (!window.confirm(`Tạo yêu cầu trả hàng cho ${order.number} (toàn bộ các món)?`)) return;
    const locations = await (await fetch("/api/refs?kind=locations")).json();
    // ponytail: returns go to the first stockroom/warehouse — per-order location choice
    // needs a picker dialog; add when staff actually need it.
    const locationId = locations.locations?.[0]?.id;
    if (!locationId) { setMsg("❌ Không có kho"); return; }
    const r = await fetch("/api/returns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id, locationId,
        items: order.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })),
        reason: "Khách trả hàng",
      }),
    });
    const d = await r.json();
    if (!r.ok) { setMsg("❌ " + d.message); return; }
    // receive immediately so inventory updates in one demo pass
    const rr = await fetch("/api/returns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnId: d.id, action: "receive" }),
    });
    setMsg(rr.ok ? `✅ ${order.number}: đã nhận trả hàng (${d.number})` : "❌ Nhận hàng: " + (await rr.json()).message);
    loadOrders();
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="p-6 grid grid-cols-[380px_1fr] gap-6 items-start">
        <section className="bg-white rounded-xl p-4 shadow-sm space-y-2">
          <h2 className="font-bold">Đơn online mới</h2>
          <select className="w-full border rounded px-3 py-2 text-sm" value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Chọn khách…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-2">
            <select className="border rounded px-3 py-2 flex-1 text-sm" value={orderType}
              onChange={(e) => setOrderType(e.target.value)}>
              <option value="delivery">Giao tận nơi</option>
              <option value="pickup">Click &amp; collect</option>
              <option value="ship_from_store">Ship từ cửa hàng</option>
            </select>
            {orderType !== "delivery" && (
              <select className="border rounded px-3 py-2 flex-1 text-sm" value={storeId}
                onChange={(e) => setStoreId(e.target.value)}>
                <option value="">Cửa hàng…</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Mã giảm giá…"
            value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
          <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-1">
            {products.slice(0, 30).map((p) => (
              <button key={p.id} onClick={() => addLine(p)}
                className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-blue-50">
                {p.name} <span className="text-slate-400">{Number(p.variants[0]?.prices[0]?.amount ?? 0n).toLocaleString("vi-VN")}₫</span>
              </button>
            ))}
          </div>
          {lines.map((l) => (
            <div key={l.variantId} className="flex justify-between text-sm">
              <span>{l.name} ×{l.quantity}</span>
              <span>{(l.quantity * l.unitPrice).toLocaleString("vi-VN")}₫</span>
            </div>
          ))}
          <p className="text-right font-bold">Tạm tính: {subtotal.toLocaleString("vi-VN")}₫</p>
          <button onClick={checkout} disabled={!customerId || !lines.length}
            className="bg-blue-600 disabled:bg-slate-300 text-white rounded px-4 py-2 w-full">Đặt hàng</button>
          {msg && <p className="text-sm">{msg}</p>}
        </section>

        <section className="bg-white rounded-xl p-4 shadow-sm overflow-x-auto">
          <h2 className="font-bold mb-3">Đơn gần đây</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="p-2">Số ĐH</th><th>Khách</th><th>Loại</th><th>Trạng thái</th><th>Tổng</th><th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b align-top">
                  <td className="p-2 font-medium">{o.number}<br /><span className="text-xs text-slate-400">{o.channel}</span></td>
                  <td>{o.customer?.name}</td>
                  <td>{o.type}</td>
                  <td>{o.status}</td>
                  <td>{Number(o.total).toLocaleString("vi-VN")}₫</td>
                  <td className="space-x-2 whitespace-nowrap">
                    {["CONFIRMED", "ALLOCATED", "PICKING", "PACKED", "READY"].includes(o.status) && o.type === "pickup" && (
                      <button onClick={() => fulfill(o, "collect")} className="text-blue-600 hover:underline">Thu khách</button>
                    )}
                    {["CONFIRMED", "ALLOCATED", "PICKING", "PACKED", "READY"].includes(o.status) && o.type !== "pickup" && (
                      <>
                        <button onClick={() => fulfill(o, "ship")} className="text-blue-600 hover:underline">Giao HVC</button>
                        <button onClick={() => fulfill(o, "cancel")} className="text-red-600 hover:underline">Huỷ</button>
                      </>
                    )}
                    {o.status === "SHIPPED" && (
                      <button onClick={() => deliver(o)} className="text-blue-600 hover:underline">Đã giao</button>
                    )}
                    {["DELIVERED", "SHIPPED"].includes(o.status) && (
                      <button onClick={() => createReturn(o)} className="text-orange-600 hover:underline">Trả hàng</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="text-sm text-slate-500 mt-2">Chưa có đơn.</p>}
        </section>
      </div>
    </main>
  );
}
