"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import Pager from "@/components/Pager";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  ShoppingBag,
  Truck,
  Store,
  Package,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  AlertCircle,
} from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";

type Product = {
  id: string;
  name: string;
  variants: { id: string; sku: string; prices: { amount: string }[] }[];
};
type Line = { variantId: string; name: string; quantity: number; unitPrice: number };
type Order = {
  id: string;
  number: string;
  channel: string;
  type: string;
  status: string;
  total: number;
  createdAt: string;
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
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 25;
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [productSearch, setProductSearch] = useState("");
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [pendingCancel, setPendingCancel] = useState<Order[]>([]);
  const [pendingReturn, setPendingReturn] = useState<Order | null>(null);
  const [pendingShip, setPendingShip] = useState<Order | null>(null);

  async function loadOrders(p = 1, q?: string, status?: string) {
    const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
    const qq = (q ?? searchFilter).trim();
    const ss = status ?? statusFilter;
    if (qq) params.set("q", qq);
    if (ss !== "ALL") params.set("status", ss);
    const r = await fetch(`/api/orders?${params}`);
    if (r.ok) {
      const d = await r.json();
      setOrders(d.orders);
      setPage(d.page);
      setTotal(d.total);
    }
  }

  // Debounced server filter — the old client-side filter ran over the
  // current page only, so matches on other pages never appeared.
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOrders(1); }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter-driven reload
  }, [searchFilter, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setLines(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]")); }
      catch { /* fresh cart */ }
      void loadOrders();
    }, 0);
    fetch("/api/products?take=200").then(async (r) => {
      if (r.ok) setProducts((await r.json()).products);
    });
    fetch("/api/customers").then(async (r) => {
      if (r.ok) setCustomers((await r.json()).customers);
    });
    fetch("/api/stores").then(async (r) => {
      if (r.ok) setStores((await r.json()).stores);
    });
    return () => window.clearTimeout(timer);
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
      return [
        ...ls,
        {
          variantId: v.id,
          name: p.name,
          quantity: 1,
          unitPrice: Number(v.prices[0]?.amount ?? 0n),
        },
      ];
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  async function checkout() {
    if (!customerId || !lines.length) return;
    if (orderType === "ship_from_store" && !storeId) {
      setMsg({ text: "Vui lòng chọn cửa hàng xuất hàng", type: "error" });
      return;
    }
    const r = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify({
        channel: "WEB",
        type: orderType,
        customerId,
        storeId: orderType !== "delivery" ? storeId : undefined,
        couponCode: couponCode || undefined,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đã tạo đơn hàng ${d.number} (${d.status}) thành công!`, type: "success" });
      setLines([]);
      setCouponCode("");
      loadOrders();
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  async function runFulfill(order: Order, action: "ship" | "collect" | "cancel", address?: string) {
    const body: Record<string, unknown> = { orderId: order.id, action };
    if (action === "ship") {
      if (!address) return;
      // P1: never hardcode the recipient phone — use the order's customer
      // phone when loaded, else ask staff. A wrong phone breaks COD
      // reconciliation and carrier delivery.
      const phone = prompt(`SĐT người nhận cho đơn ${order.number}:`, "")?.replace(/[\s().-]/g, "") ?? "";
      if (!/^\+?\d{9,15}$/.test(phone)) {
        setMsg({ text: "SĐT người nhận không hợp lệ (9-15 số)", type: "error" });
        return;
      }
      Object.assign(body, {
        recipientName: order.customer.name,
        recipientPhone: phone,
        address,
      });
    }
    const r = await fetch("/api/fulfillment", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đơn ${order.number}: ${d.status}`, type: "success" });
      loadOrders();
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  function fulfill(order: Order, action: "ship" | "collect" | "cancel") {
    if (action === "cancel") { setPendingCancel([order]); return; }
    if (action === "ship") { setPendingShip(order); return; }
    void runFulfill(order, action);
  }

  async function issueInvoice(order: Order) {
    const r = await fetch(`/api/orders/${order.id}/invoice`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setMsg({ text: `Đã gửi yêu cầu phát hành hóa đơn cho ${order.number}`, type: "success" });
    } else {
      setMsg({ text: d.message ?? `HTTP ${r.status}`, type: "error" });
    }
  }

  async function deliver(order: Order) {
    const r = await fetch("/api/fulfillment", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify({ orderId: order.id, action: "deliver" }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đơn ${order.number}: Đã xác nhận giao thành công`, type: "success" });
      loadOrders();
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  async function createReturn(order: Order) {
    const locations = await (await fetch("/api/refs?kind=locations")).json();
    const locationId = locations.locations?.[0]?.id;
    if (!locationId) {
      setMsg({ text: "Không tìm thấy kho nhận trả hàng", type: "error" });
      return;
    }
    const r = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify({
        action: "create",
        orderId: order.id,
        locationId,
        items: order.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })),
        reason: "Khách trả hàng",
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setMsg({ text: d.message, type: "error" });
      return;
    }
    const rr = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify({ returnId: d.id, action: "receive" }),
    });
    if (rr.ok) {
      setMsg({ text: `Đã nhận hàng trả và hoàn nhập kho (${d.number})`, type: "success" });
      loadOrders();
    } else {
      setMsg({ text: (await rr.json()).message, type: "error" });
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3" /> Đã giao</span>;
      case "SHIPPED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"><Truck className="w-3 h-3" /> Đang giao</span>;
      case "CANCELLED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200"><XCircle className="w-3 h-3" /> Đã huỷ</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" /> {status}</span>;
    }
  };

  // Server-filtered: search/status run in /api/orders (L2), so the table
  // shows every match across pages — never a page-local subset.
  const filteredOrders = orders;

  return (
    <main className="min-h-screen bg-[#faf7f2] pb-16">
      <Nav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header Title */}
        <div className="bg-white p-6 rounded-2xl border border-[#ede5d8] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1c1917] tracking-tight">Quản Lý Đơn Hàng &amp; Vận Chuyển</h1>
            <p className="text-xs text-slate-500 mt-1">
              Xử lý luồng đơn hàng đa kênh: Web bán lẻ, Click &amp; Collect nhận tại shop và giao hàng tận nơi
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#faf4ea] text-[#574431]">
              Tổng cộng: <b>{total}</b> đơn
            </span>
          </div>
        </div>

        {/* Global Toast */}
        {msg && (
          <div
            className={`p-4 rounded-2xl flex items-center justify-between gap-2 text-xs font-semibold ${
              msg.type === "success"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {msg.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
              <span>{msg.text}</span>
            </div>
            <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-[#574431] font-bold">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Form: Create Online Order (4 cols) */}
          <div className="lg:col-span-4 bg-white rounded-3xl p-5 border border-[#ede5d8] shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[#ede5d8]">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-[#1c1917] text-sm">Tạo Đơn Online Mới</h2>
                <p className="text-[11px] text-slate-400">Kênh Web / Hotline</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#574431] mb-1">Khách hàng</label>
                <select
                  className="w-full bg-[#faf7f2] border border-[#ede5d8] rounded-xl px-3 py-2 text-xs text-[#1c1917] focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">— Chọn khách hàng —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#574431] mb-1">Phương thức nhận hàng</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: "delivery", label: "Giao tận nơi", icon: Truck },
                    { id: "pickup", label: "Tại shop", icon: Store },
                    { id: "ship_from_store", label: "Ship từ shop", icon: Package },
                  ].map((t) => {
                    const Icon = t.icon;
                    const active = orderType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setOrderType(t.id)}
                        className={`p-2 rounded-xl text-center text-[11px] font-semibold border flex flex-col items-center gap-1 transition-all ${
                          active
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                            : "bg-[#faf7f2] border-[#ede5d8] text-[#574431] hover:bg-[#faf4ea]"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {orderType !== "delivery" && (
                <div>
                  <label className="block text-xs font-semibold text-[#574431] mb-1">Cửa hàng phục vụ</label>
                  <select
                    className="w-full bg-[#faf7f2] border border-[#ede5d8] rounded-xl px-3 py-2 text-xs text-[#1c1917] focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                  >
                    <option value="">— Chọn chi nhánh —</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#574431] mb-1">Mã khuyến mãi</label>
                <input
                  className="w-full bg-[#faf7f2] border border-[#ede5d8] rounded-xl px-3 py-2 text-xs placeholder:text-slate-400 uppercase font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="COUPON..."
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#574431] mb-1">Chọn sản phẩm thêm vào đơn</label>
                <input
                  className="w-full bg-[#faf7f2] border border-[#ede5d8] rounded-xl px-3 py-1.5 text-xs mb-1.5 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Tìm tên sách / SKU..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <div className="max-h-36 overflow-y-auto border border-[#ede5d8] rounded-xl p-1.5 space-y-1 bg-[#faf7f2]">
                  {products
                    .filter((p) => {
                      const q = productSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        p.name.toLowerCase().includes(q) ||
                        p.variants.some((v) => v.sku.toLowerCase().includes(q))
                      );
                    })
                    .slice(0, 30)
                    .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addLine(p)}
                      className="w-full text-left p-1.5 rounded-lg text-xs hover:bg-white hover:shadow-2xs transition-all flex items-center justify-between group"
                    >
                      <span className="truncate max-w-[170px] text-[#1c1917] font-medium">{p.name}</span>
                      <span className="text-[11px] font-bold text-indigo-600 shrink-0">
                        {Number(p.variants[0]?.prices[0]?.amount ?? 0n).toLocaleString("vi-VN")} ₫
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cart List */}
              <div className="pt-2 space-y-1.5">
                {lines.map((l) => (
                  <div key={l.variantId} className="flex justify-between items-center text-xs p-1.5 bg-[#faf7f2] rounded-lg">
                    <span className="truncate max-w-[180px] font-medium text-[#1c1917]">
                      {l.name} <b className="text-indigo-600">×{l.quantity}</b>
                    </span>
                    <span className="font-bold text-[#1c1917]">
                      {(l.quantity * l.unitPrice).toLocaleString("vi-VN")} ₫
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-[#ede5d8] flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Tạm tính:</span>
                <span className="text-base font-black text-[#1c1917]">
                  {subtotal.toLocaleString("vi-VN")} ₫
                </span>
              </div>

              <button
                onClick={checkout}
                disabled={!customerId || !lines.length}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-[#ede5d8] disabled:text-white/50 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.01]"
              >
                Xác nhận tạo đơn hàng
              </button>
            </div>
          </div>

          {/* Right Section: Orders List (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Filter Tabs & Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-[#ede5d8] shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 overflow-x-auto">
                {[
                  { id: "ALL", label: "Tất cả" },
                  { id: "PROCESSING", label: "Chờ xử lý" },
                  { id: "SHIPPED", label: "Đang giao" },
                  { id: "DELIVERED", label: "Đã giao" },
                  { id: "CANCELLED", label: "Đã huỷ" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                      statusFilter === tab.id
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-[#574431] hover:bg-[#faf4ea]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="w-full bg-[#faf7f2] border border-[#ede5d8] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#1c1917] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Lọc số đơn, tên khách..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-3xl border border-[#ede5d8] shadow-xs overflow-hidden">
              {selectedOrders.size > 0 && (
                <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-700">
                    Đã chọn {selectedOrders.size} đơn hàng
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const targets = [...selectedOrders]
                          .map((id) => orders.find((o) => o.id === id))
                          .filter((o): o is Order => !!o && ["CONFIRMED", "ALLOCATED", "PICKING", "PACKED", "READY"].includes(o.status));
                        if (targets.length > 0) setPendingCancel(targets);
                        setSelectedOrders(new Set());
                      }}
                      aria-label="Huỷ các đơn hàng đã chọn"
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Huỷ đã chọn
                    </button>
                    <button
                      onClick={() => setSelectedOrders(new Set())}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#faf4ea] text-[#574431] hover:bg-[#ede5d8] transition-colors"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#faf7f2] border-b border-[#ede5d8] text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                    <tr>
                      <th className="p-4 w-10">
                        <input
                          type="checkbox"
                          checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                          onChange={() => {
                            if (selectedOrders.size === filteredOrders.length) {
                              setSelectedOrders(new Set());
                            } else {
                              setSelectedOrders(new Set(filteredOrders.map((o) => o.id)));
                            }
                          }}
                          className="w-4 h-4 rounded border-[#e8dac5] text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                      <th className="p-4">Mã ĐH &amp; Kênh</th>
                      <th className="p-4">Khách hàng</th>
                      <th className="p-4">Phương thức</th>
                      <th className="p-4">Trạng thái</th>
                      <th className="p-4 text-right">Tổng tiền</th>
                      <th className="p-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ede5d8]">
                    {filteredOrders.map((o) => (
                      <tr key={o.id} className={`hover:bg-[#faf7f2] transition-colors ${selectedOrders.has(o.id) ? "bg-indigo-50/50" : ""}`}>
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedOrders.has(o.id)}
                            onChange={() => {
                              const next = new Set(selectedOrders);
                              if (next.has(o.id)) {
                                next.delete(o.id);
                              } else {
                                next.add(o.id);
                              }
                              setSelectedOrders(next);
                            }}
                            className="w-4 h-4 rounded border-[#e8dac5] text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="p-4 font-medium text-[#1c1917]">
                          <span className="font-bold text-indigo-700">{o.number}</span>
                          <span className="block text-[11px] text-slate-400 font-mono mt-0.5">
                            {o.channel} · {new Date(o.createdAt).toLocaleDateString("vi-VN")}
                          </span>
                        </td>
                        <td className="p-4 text-[#1c1917]">
                          <span className="font-semibold">{o.customer?.name ?? "Khách vãng lai"}</span>
                        </td>
                        <td className="p-4 text-[#574431] font-medium">
                          {o.type === "delivery" && <span className="inline-flex items-center gap-1"><Truck className="w-3.5 h-3.5 text-slate-400" /> Giao tận nơi</span>}
                          {o.type === "pickup" && <span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5 text-slate-400" /> Tại quầy</span>}
                          {o.type === "ship_from_store" && <span className="inline-flex items-center gap-1"><Package className="w-3.5 h-3.5 text-slate-400" /> Ship từ shop</span>}
                        </td>
                        <td className="p-4">
                          {getStatusBadge(o.status)}
                        </td>
                        <td className="p-4 text-right font-black text-[#1c1917]">
                          {Number(o.total).toLocaleString("vi-VN")} ₫
                        </td>
                        <td className="p-4 text-right whitespace-nowrap space-x-1.5">
                          {["PAID", "CONFIRMED", "ALLOCATED", "PICKING", "PACKED", "READY"].includes(o.status) && o.type === "pickup" && (
                            <button
                              onClick={() => fulfill(o, "collect")}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                            >
                              Thu khách
                            </button>
                          )}
                          {["PAID", "CONFIRMED", "ALLOCATED", "PICKING", "PACKED", "READY"].includes(o.status) && o.type !== "pickup" && (
                            <>
                              <button
                                onClick={() => fulfill(o, "ship")}
                                aria-label={`Giao đơn ${o.number} qua hãng vận chuyển`}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                              >
                                Giao HVC
                              </button>
                              <button
                                onClick={() => fulfill(o, "cancel")}
                                aria-label={`Huỷ đơn hàng ${o.number}`}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                              >
                                Huỷ
                              </button>
                            </>
                          )}
                          {o.status === "SHIPPED" && (
                            <button
                              onClick={() => deliver(o)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                            >
                              Đã giao
                            </button>
                          )}
                          {["DELIVERED", "SHIPPED"].includes(o.status) && (
                            <>
                              <button
                                onClick={() => issueInvoice(o)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors"
                              >
                                Phát hành HĐ
                              </button>
                              <button
                                onClick={() => setPendingReturn(o)}
                                aria-label={`Tạo yêu cầu trả hàng cho đơn ${o.number}`}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
                              >
                                Trả hàng
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredOrders.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Không tìm thấy đơn hàng nào phù hợp với bộ lọc.
                </div>
              )}
              <div className="border-t border-[#ede5d8]">
                <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={(p) => loadOrders(p)} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        request={pendingShip ? {
          title: `Giao đơn ${pendingShip.number}?`,
          body: `Nhập địa chỉ giao hàng cho khách ${pendingShip.customer.name}. Đơn chuyển sang hãng vận chuyển sau khi xác nhận.`,
          confirmLabel: "Giao hàng",
          input: { label: "Địa chỉ giao hàng", defaultValue: "123 Đường Sách, Q.1, TP.HCM", required: true },
        } : pendingCancel.length > 0 ? {
          title: pendingCancel.length === 1 ? `Huỷ đơn ${pendingCancel[0].number}?` : `Huỷ ${pendingCancel.length} đơn hàng?`,
          body: pendingCancel.length === 1
            ? `Đơn ${pendingCancel[0].number} (${Number(pendingCancel[0].total).toLocaleString("vi-VN")} ₫) sẽ bị huỷ và tồn kho được hoàn lại. Không thể hoàn tác.`
            : `Các đơn ${pendingCancel.map((o) => o.number).join(", ")} sẽ bị huỷ và tồn kho được hoàn lại. Không thể hoàn tác.`,
          confirmLabel: pendingCancel.length === 1 ? "Huỷ đơn" : `Huỷ ${pendingCancel.length} đơn`,
        } : pendingReturn ? {
          title: `Trả hàng đơn ${pendingReturn.number}?`,
          body: "Tạo yêu cầu đổi trả cho toàn bộ món trong đơn, nhận hàng về kho và hoàn nhập tồn kho.",
          confirmLabel: "Tạo yêu cầu trả hàng",
        } : null}
        onConfirm={(value) => {
          if (pendingShip) void runFulfill(pendingShip, "ship", value);
          else if (pendingCancel.length > 0) void (async () => { for (const o of pendingCancel) await runFulfill(o, "cancel"); })();
          else if (pendingReturn) void createReturn(pendingReturn);
          setPendingShip(null); setPendingCancel([]); setPendingReturn(null);
        }}
        onCancel={() => { setPendingShip(null); setPendingCancel([]); setPendingReturn(null); }}
      />
    </main>
  );
}
