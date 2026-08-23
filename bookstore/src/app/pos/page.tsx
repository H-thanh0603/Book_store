"use client";
import { useEffect, useRef, useState } from "react";
import Nav from "../nav";
import {
  Store,
  Search,
  ShoppingCart,
  Plus,
  Minus,
  QrCode,
  Banknote,
  PauseCircle,
  RotateCcw,
  Sparkles,
  Award,
  Tag,
  CheckCircle2,
  AlertCircle,
  User,
  LogOut,
  Boxes,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  category?: { name: string } | null;
  variants: { id: string; sku: string; prices: { amount: string }[] }[];
};
type Line = {
  variantId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
};
type Customer = {
  id: string;
  code: string;
  name: string;
  phone: string;
  loyalty: { points: number } | null;
};
type Quote = {
  subtotal: number;
  discountTotal: number;
  redeemDiscount: number;
  redeemable: number;
  total: number;
  promos: { name: string; discountTotal: number }[];
};
type HeldCart = { lines: Line[]; customerId: string | null; label: string };

const HELD_KEY = "pos.heldCarts";

function loadHeld(): HeldCart[] {
  try {
    return JSON.parse(localStorage.getItem(HELD_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
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
  const paymentAttemptRef = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeld(loadHeld());
    fetch("/api/stores").then(async (r) => {
      if (r.ok) {
        const d = await r.json();
        setStores(d.stores);
        if (d.stores[0]) setStoreId(d.stores[0].id);
      }
    });
    fetch("/api/products").then(async (r) => {
      if (r.ok) setProducts((await r.json()).products);
    });
    fetch("/api/customers").then(async (r) => {
      if (r.ok) setCustomers((await r.json()).customers);
    });
  }, []);

  // Server quote — the client never computes what it pays.
  useEffect(() => {
    if (!shiftId || lines.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuote(null);
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/pos/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftId,
          storeId,
          customerId: customerId || null,
          couponCode: couponCode || null,
          redeemPoints,
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        }),
      }).then(async (r) => {
        if (r.ok) setQuote(await r.json());
      });
    }, 250);
    return () => clearTimeout(t);
  }, [lines, shiftId, storeId, customerId, couponCode, redeemPoints]);

  const decreaseQty = (variantId: string) => {
    setLines((ls) =>
      ls.flatMap((x) => {
        if (x.variantId !== variantId) return [x];
        if (x.quantity > 1) return [{ ...x, quantity: x.quantity - 1 }];
        return [];
      })
    );
  };

  const increaseQty = (variantId: string) => {
    setLines((ls) =>
      ls.map((x) => (x.variantId === variantId ? { ...x, quantity: x.quantity + 1 } : x))
    );
  };

  async function openShift() {
    const res = await fetch("/api/terminals?storeId=" + storeId);
    const term = res.ok ? (await res.json()).terminals?.[0] : null;
    if (!term) {
      setMsg({ text: "Không tìm thấy terminal cho cửa hàng này.", type: "error" });
      return;
    }
    const r = await fetch("/api/pos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "open_shift",
        terminalId: term.id,
        storeId,
        openingCash: 500000,
      }),
    });
    if (r.ok) {
      setShiftId((await r.json()).shiftId);
      setMsg({ text: "Mở ca thành công với tiền đầu ca: 500.000 ₫", type: "success" });
    } else {
      setMsg({ text: (await r.json()).message, type: "error" });
    }
  }

  async function closeShift() {
    if (!window.confirm("Bạn có chắc chắn muốn kết thúc và đóng ca làm việc này?")) return;
    const r = await fetch("/api/pos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close_shift", shiftId, closingCash: 0 }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({
        text: `Đóng ca thành công! Tiền kỳ vọng: ${d.expectedCash.toLocaleString("vi-VN")} ₫, lệch: ${d.variance.toLocaleString("vi-VN")} ₫`,
        type: "success",
      });
      setShiftId(null);
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  function addLine(p: Product) {
    const v = p.variants[0];
    if (!v || !shiftId) return;
    setLines((ls) => {
      const ex = ls.find((l) => l.variantId === v.id);
      if (ex) return ls.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...ls,
        {
          variantId: v.id,
          sku: v.sku,
          name: p.name,
          quantity: 1,
          unitPrice: Number(v.prices[0]?.amount ?? 0n),
        },
      ];
    });
  }

  const total = quote?.total ?? lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  async function pay(method: string, giftCardCode?: string) {
    const requestBody = {
      action: "sale", shiftId, storeId, customerId: customerId || undefined,
      redeemPoints: redeemPoints || undefined, couponCode: couponCode || undefined,
      items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      payments: [{ method, amount: total, giftCardCode }],
    };
    const signature = JSON.stringify(requestBody);
    if (paymentAttemptRef.current?.signature !== signature)
      paymentAttemptRef.current = { signature, key: crypto.randomUUID() };
    const r = await fetch("/api/pos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...requestBody,
        idempotencyKey: paymentAttemptRef.current.key,
      }),
    });
    const d = await r.json();
    if (r.ok) {
      paymentAttemptRef.current = null;
      setMsg({
        text: `Thanh toán thành công hóa đơn ${d.number}! Tổng: ${d.total.toLocaleString("vi-VN")} ₫ (Tích +${d.loyaltyEarned} điểm${d.discountTotal ? `, Giảm ${d.discountTotal.toLocaleString("vi-VN")} ₫` : ""})`,
        type: "success",
      });
      setLines([]);
      setRedeemPoints(0);
      setCouponCode("");
      setCustomerId("");
      searchRef.current?.focus();
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  function hold() {
    if (!lines.length) return;
    const label = window.prompt(
      "Đặt tên giỏ hàng cần giữ (Ví dụ: Khách chọn thêm sách):",
      `Giỏ #${held.length + 1} (${new Date().toLocaleTimeString("vi-VN")})`
    );
    if (!label) return;
    const next = [...loadHeld(), { lines, customerId: customerId || null, label }];
    localStorage.setItem(HELD_KEY, JSON.stringify(next));
    setHeld(next);
    setLines([]);
    setRedeemPoints(0);
    setCouponCode("");
    setCustomerId("");
    setMsg({ text: `Đã lưu giỏ "${label}"`, type: "info" });
  }

  function resume(i: number) {
    const h = held[i];
    setLines(h.lines);
    setCustomerId(h.customerId ?? "");
    const next = held.filter((_, j) => j !== i);
    localStorage.setItem(HELD_KEY, JSON.stringify(next));
    setHeld(next);
    setMsg({ text: `Đã phục hồi giỏ "${h.label}"`, type: "info" });
  }

  async function refund() {
    if (!refundNumber.trim()) return;
    if (!window.confirm(`Xác nhận hoàn tiền toàn bộ giao dịch ${refundNumber}? Thao tác này không thể hoàn tác.`))
      return;
    const r = await fetch("/api/pos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txNumber: refundNumber.trim(), shiftId, storeId }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({
        text: `Đã hoàn tiền giao dịch ${d.number} — Số tiền hoàn: ${d.total.toLocaleString("vi-VN")} ₫`,
        type: "success",
      });
      setRefundNumber("");
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.variants.some((v) => v.sku.toLowerCase().includes(q.toLowerCase()))
  );
  const cust = customers.find((c) => c.id === customerId);
  const selectedStore = stores.find((s) => s.id === storeId);

  return (
    <main className="min-h-screen bg-slate-100/70 pb-12 flex flex-col">
      <Nav />

      {/* POS Top Control Bar */}
      <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm sm:text-base">
                  POS Thu Ngân Bán Lẻ
                </span>
                {shiftId ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Đang mở ca
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                    Chưa mở ca
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Chi nhánh: <span className="font-semibold text-slate-700">{selectedStore?.name ?? "Chưa chọn"}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {shiftId && (
              <button
                onClick={closeShift}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Kết thúc ca
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main POS Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 w-full flex-1">
        {/* Global Toast Notification */}
        {msg && (
          <div
            className={`mb-4 p-3.5 rounded-2xl flex items-center justify-between gap-2 text-xs font-medium shadow-sm transition-all ${
              msg.type === "success"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : msg.type === "error"
                ? "bg-red-50 border border-red-200 text-red-800"
                : "bg-blue-50 border border-blue-200 text-blue-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {msg.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {msg.type === "error" && <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
              {msg.type === "info" && <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />}
              <span>{msg.text}</span>
            </div>
            <button
              onClick={() => setMsg(null)}
              className="text-slate-400 hover:text-slate-600 font-bold px-1.5"
            >
              ✕
            </button>
          </div>
        )}

        {!shiftId ? (
          /* Shift Open Screen */
          <div className="max-w-xl mx-auto my-8 space-y-6">
            <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-md space-y-6">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center shadow-inner">
                  <Store className="w-7 h-7" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Mở Ca Bán Hàng</h2>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Chọn chi nhánh làm việc và khai báo số tiền mặt ban đầu để bắt đầu phục vụ khách hàng.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Chi nhánh / Cửa hàng
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-600 font-medium">Tiền mặt đầu ca (Float):</span>
                    <p className="text-base font-bold text-indigo-900">500.000 ₫</p>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-200/60 text-indigo-800 font-semibold">
                    Mặc định
                  </span>
                </div>

                <button
                  onClick={openShift}
                  className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
                >
                  <Store className="w-4 h-4" />
                  Mở ca &amp; Bắt đầu bán hàng
                </button>
              </div>
            </div>

            {/* Quick Refund Block */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-slate-800">
                <RotateCcw className="w-4 h-4 text-orange-500" />
                <h3 className="font-bold text-sm">Tra Cứu &amp; Hoàn Tiền Hóa Đơn</h3>
              </div>
              <p className="text-xs text-slate-500">
                Nhập số mã giao dịch (TXN) để thực hiện hoàn tiền trả hàng nhanh.
              </p>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Nhập mã TXN (VD: TXN-NH-001)..."
                  value={refundNumber}
                  onChange={(e) => setRefundNumber(e.target.value)}
                />
                <button
                  disabled={!refundNumber.trim()}
                  onClick={refund}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Hoàn tiền
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Active POS Workspace */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Side: Search & Product Catalog (7 or 8 cols) */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchRef}
                  autoFocus
                  className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="Tìm theo tên sách, tác giả, SKU hoặc quét mã barcode..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q && (
                  <button
                    onClick={() => setQ("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg"
                  >
                    Xoá
                  </button>
                )}
              </div>

              {/* Product Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-3.5 max-h-[calc(100vh-230px)] overflow-y-auto pr-1">
                {filtered.map((p) => {
                  const price = Number(p.variants[0]?.prices[0]?.amount ?? 0n);
                  const sku = p.variants[0]?.sku;
                  return (
                    <button
                      key={p.id}
                      onClick={() => addLine(p)}
                      className="group bg-white rounded-2xl p-4 text-left border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-indigo-300 hover:scale-[1.01] transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="w-full h-24 rounded-xl bg-gradient-to-br from-indigo-50 via-slate-50 to-blue-50 flex items-center justify-center text-indigo-400 mb-3 group-hover:text-indigo-600 transition-colors">
                          <Boxes className="w-8 h-8 opacity-70" />
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 group-hover:text-indigo-600 transition-colors leading-snug">
                          {p.name}
                        </h4>
                        <span className="inline-block mt-1 font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                          {sku}
                        </span>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-sm font-black text-indigo-700">
                          {price.toLocaleString("vi-VN")} ₫
                        </span>
                        <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {filtered.length === 0 && (
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 text-slate-400">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium text-slate-600">Không tìm thấy sản phẩm nào</p>
                  <p className="text-xs text-slate-400 mt-0.5">Thử tìm bằng từ khoá hoặc mã SKU khác</p>
                </div>
              )}
            </div>

            {/* Right Side: Cart & Checkout (5 or 4 cols) */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-4">
              {/* Held Carts Notification */}
              {held.length > 0 && (
                <div className="bg-amber-50 rounded-2xl p-3.5 border border-amber-200 text-amber-900 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-1.5">
                      <PauseCircle className="w-4 h-4 text-amber-600" />
                      Giỏ hàng đang giữ ({held.length})
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {held.map((h, i) => (
                      <button
                        key={i}
                        onClick={() => resume(i)}
                        className="w-full bg-white hover:bg-amber-100/80 border border-amber-200 rounded-xl px-3 py-2 text-xs flex items-center justify-between transition-colors text-left"
                      >
                        <span className="font-medium truncate">{h.label}</span>
                        <span className="font-bold text-amber-800 shrink-0 ml-2">
                          {h.lines.length} món →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cart Container Card */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-bold text-slate-900 text-sm">Giỏ Hàng Thanh Toán</h3>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                      {lines.reduce((s, l) => s + l.quantity, 0)} món
                    </span>
                  </div>

                  {/* Cart Items List */}
                  <div className="py-2 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {lines.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Chưa có sản phẩm trong giỏ. <br />
                        Chọn từ danh mục bên trái.
                      </div>
                    ) : (
                      lines.map((l) => (
                        <div key={l.variantId} className="py-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-900 truncate">{l.name}</p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {l.unitPrice.toLocaleString("vi-VN")} ₫
                            </p>
                          </div>

                          {/* Stepper */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => decreaseQty(l.variantId)}
                              className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-bold text-slate-900">
                              {l.quantity}
                            </span>
                            <button
                              onClick={() => increaseQty(l.variantId)}
                              className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="text-right shrink-0 min-w-[70px]">
                            <span className="text-xs font-bold text-slate-900">
                              {(l.quantity * l.unitPrice).toLocaleString("vi-VN")} ₫
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Customer and Loyalty points */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        value={customerId}
                        onChange={(e) => setCustomerId(e.target.value)}
                      >
                        <option value="">Khách vãng lai (Không tích điểm)</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.phone}) {c.loyalty ? `· 💎 ${c.loyalty.points}đ` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {cust?.loyalty && cust.loyalty.points > 0 && (
                      <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-indigo-900">
                          <span className="flex items-center gap-1 font-semibold">
                            <Award className="w-3.5 h-3.5 text-indigo-600" />
                            Dùng điểm loyalty:
                          </span>
                          <span className="font-bold">
                            Tối đa {cust.loyalty.points}đ (10k ₫/đ)
                          </span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={cust.loyalty.points}
                          className="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-bold"
                          value={redeemPoints}
                          onChange={(e) =>
                            setRedeemPoints(
                              Math.max(0, Math.min(cust.loyalty!.points, Number(e.target.value) || 0))
                            )
                          }
                        />
                      </div>
                    )}

                    {/* Coupon Input */}
                    <div className="relative">
                      <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs placeholder:text-slate-400 text-slate-900 uppercase font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="MÃ GIẢM GIÁ / COUPON..."
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>

                  {/* Calculation Breakdown */}
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Tạm tính hàng hoá</span>
                      <span className="font-semibold text-slate-800">
                        {(quote?.subtotal ?? total).toLocaleString("vi-VN")} ₫
                      </span>
                    </div>

                    {quote && quote.discountTotal > 0 && (
                      <div className="flex justify-between text-emerald-700 font-medium">
                        <span>{quote.promos.map((p) => p.name).join(", ") || "Khuyến mãi"}</span>
                        <span>−{quote.discountTotal.toLocaleString("vi-VN")} ₫</span>
                      </div>
                    )}

                    {quote && quote.redeemDiscount > 0 && (
                      <div className="flex justify-between text-indigo-700 font-medium">
                        <span>Điểm thưởng ({quote.redeemable} điểm)</span>
                        <span>−{quote.redeemDiscount.toLocaleString("vi-VN")} ₫</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Total and Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-slate-500">Tổng thanh toán:</span>
                    <span className="text-2xl font-black text-slate-900">
                      {total.toLocaleString("vi-VN")} ₫
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      disabled={!lines.length}
                      onClick={() => pay("CASH")}
                      className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 transition-all hover:scale-[1.02]"
                    >
                      <Banknote className="w-4 h-4" />
                      Tiền mặt
                    </button>
                    <button
                      disabled={!lines.length}
                      onClick={() => pay("QR")}
                      className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/20 transition-all hover:scale-[1.02]"
                    >
                      <QrCode className="w-4 h-4" />
                      Quét mã QR
                    </button>
                  </div>

                  <button
                    disabled={!lines.length}
                    onClick={hold}
                    className="w-full py-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <PauseCircle className="w-3.5 h-3.5 text-slate-500" />
                    Tạm giữ giỏ hàng
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
