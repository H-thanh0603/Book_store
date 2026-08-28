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
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  User,
  LogOut,
  Boxes,
  Trash2,
  X,
  Printer,
  Camera,
  Wifi,
  WifiOff,
} from "lucide-react";
import { printReceipt, type ReceiptData } from "@/lib/receipt";
import BarcodeScanner from "@/components/BarcodeScanner";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

type Product = {
  id: string;
  name: string;
  category?: { name: string } | null;
  variants: { id: string; sku: string; prices: { amount: string }[]; barcodes: { barcode: string }[] }[];
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
  const [refundNumber, setRefundNumber] = useState("");
  const [lastTx, setLastTx] = useState<{ number: string; total: number; method: string; items: typeof lines; date: string } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const paymentAttemptRef = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    // Track online status
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

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

    // Register service worker for offline support
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        // Pre-cache products for offline
        reg.active?.postMessage({ type: "CACHE_PRODUCTS" });
      }).catch(() => {});

      // Listen for sync completion messages
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SYNC_COMPLETE") {
          setMsg({ text: `Đã đồng bộ ${event.data.count} đơn hàng offline`, type: "success" });
          setPendingSync(0);
        }
      });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Keyboard shortcuts for POS
  useKeyboardShortcuts({
    "ctrl+k": () => searchRef.current?.focus(),
    "ctrl+n": () => {
      if (shiftId) {
        setLines([]);
        setCustomerId("");
        searchRef.current?.focus();
      }
    },
    "f2": () => searchRef.current?.focus(),
    "f4": () => setScannerOpen(true),
  });

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

  const removeLine = (variantId: string) => {
    setLines((ls) => ls.filter((x) => x.variantId !== variantId));
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
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
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
    if (!window.confirm("Kết thúc ca làm việc?")) return;
    const r = await fetch("/api/pos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
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
    setQ("");
    searchRef.current?.focus();
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);

  async function pay(method: string) {
    const requestBody = {
      action: "sale", shiftId, storeId, customerId: customerId || undefined,
      items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      payments: [{ method, amount: total }],
    };
    const signature = JSON.stringify(requestBody);
    if (paymentAttemptRef.current?.signature !== signature)
      paymentAttemptRef.current = { signature, key: crypto.randomUUID() };

    // Try online first, queue for offline if network fails
    let r: Response;
    try {
      r = await fetch("/api/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
        body: JSON.stringify({
          ...requestBody,
          idempotencyKey: paymentAttemptRef.current.key,
        }),
      });
    } catch {
      // Network failure — queue for offline sync
      const offlineSale = {
        id: paymentAttemptRef.current.key,
        requestBody,
        timestamp: Date.now(),
        storeId,
        items: lines.map((l) => ({ ...l })),
        total,
      };
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "QUEUE_SALE",
          sale: offlineSale,
        });
      }
      setPendingSync((p) => p + 1);
      setMsg({
        text: "Mất mạng! Đơn hàng đã được lưu offline. Sẽ tự động đồng bộ khi có mạng.",
        type: "info",
      });
      setLines([]);
      setCustomerId("");
      searchRef.current?.focus();
      return;
    }

    const d = await r.json();
    if (r.ok) {
      paymentAttemptRef.current = null;
      setLastTx({
        number: d.number,
        total: d.total,
        method,
        items: [...lines],
        date: new Date().toLocaleString("vi-VN"),
      });
      setMsg({
        text: `Thanh toán thành công! ${d.number} — ${d.total.toLocaleString("vi-VN")} ₫`,
        type: "success",
      });
      setLines([]);
      setCustomerId("");
      searchRef.current?.focus();
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  async function refund() {
    if (!refundNumber.trim()) return;
    if (!window.confirm(`Hoàn tiền giao dịch ${refundNumber}?`)) return;
    const r = await fetch("/api/pos", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ txNumber: refundNumber.trim(), shiftId, storeId }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đã hoàn tiền ${d.number} — ${d.total.toLocaleString("vi-VN")} ₫`, type: "success" });
      setRefundNumber("");
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  // Search: match by name, SKU, or barcode
  const filtered = products.filter((p) => {
    const query = q.toLowerCase().trim();
    if (!query) return true;
    return (
      p.name.toLowerCase().includes(query) ||
      p.variants.some((v) =>
        v.sku.toLowerCase().includes(query) ||
        v.barcodes.some((bc) => bc.barcode.includes(query))
      )
    );
  });
  const selectedStore = stores.find((s) => s.id === storeId);

  function handlePrintReceipt() {
    if (!lastTx) return;
    const receiptData: ReceiptData = {
      storeName: selectedStore?.name ?? "Melio Bookstore",
      receiptNumber: lastTx.number,
      date: lastTx.date,
      items: lastTx.items.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        total: l.quantity * l.unitPrice,
      })),
      subtotal: lastTx.total,
      discountTotal: 0,
      total: lastTx.total,
      paymentMethod: lastTx.method === "CASH" ? "Tiền mặt" : "QR Code",
    };
    printReceipt(receiptData);
  }

  function handleBarcodeScan(barcode: string) {
    setScannerOpen(false);
    setQ(barcode);
    // Auto-add if exact barcode match
    const match = products.find((p) =>
      p.variants.some((v) => v.barcodes.some((bc) => bc.barcode === barcode))
    );
    if (match) addLine(match);
    else searchRef.current?.focus();
  }

  return (
    <main className="min-h-screen bg-slate-100/70 pb-12 flex flex-col">
      <Nav />

      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm sm:text-base">POS</span>
                {shiftId ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    MỞ CA
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                    CHƯA MỞ CA
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isOnline 
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}>
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {isOnline ? "ONLINE" : "OFFLINE"}
                  {!isOnline && pendingSync > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 text-[9px]">
                      {pendingSync} chờ sync
                    </span>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">{selectedStore?.name ?? "Chưa chọn"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {shiftId && (
              <button
                onClick={closeShift}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Đóng ca
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {msg && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 w-full">
          <div
            className={`p-3 rounded-xl flex items-center justify-between gap-2 text-xs font-medium shadow-sm ${
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
              <span>{msg.text}</span>
            </div>
            <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600 px-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {lastTx && msg?.type === "success" && (
            <button
              onClick={handlePrintReceipt}
              className="mt-2 w-full py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              In hóa đơn
            </button>
          )}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 w-full flex-1">
        {!shiftId ? (
          /* ── SHIFT OPEN ── */
          <div className="max-w-md mx-auto my-8 space-y-4">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md space-y-5">
              <div className="text-center space-y-1">
                <Store className="w-10 h-10 text-indigo-600 mx-auto" />
                <h2 className="text-xl font-bold text-slate-900">Mở Ca</h2>
              </div>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={openShift}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md transition-all"
              >
                Mở ca bán hàng
              </button>
            </div>

            {/* Quick Refund */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <RotateCcw className="w-4 h-4 text-orange-500" />
                Hoàn tiền nhanh
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Mã giao dịch (TXN-...)"
                  value={refundNumber}
                  onChange={(e) => setRefundNumber(e.target.value)}
                />
                <button
                  disabled={!refundNumber.trim()}
                  onClick={refund}
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-white/50 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Hoàn tiền
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ── ACTIVE POS ── */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* LEFT: Search + Products */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-3">
              {/* Barcode / Search Input */}
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    ref={searchRef}
                    autoFocus
                    className="w-full bg-white border-2 border-indigo-200 rounded-2xl pl-12 pr-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    placeholder="Quét mã barcode hoặc gõ tên sách..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {q && (
                    <button
                      onClick={() => { setQ(""); searchRef.current?.focus(); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setScannerOpen(true)}
                  className="shrink-0 w-12 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-sm transition-colors"
                  title="Quét barcode bằng camera"
                >
                  <Camera className="w-5 h-5" />
                </button>
              </div>

              {/* Product Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
                {filtered.map((p) => {
                  const price = Number(p.variants[0]?.prices[0]?.amount ?? 0n);
                  return (
                    <button
                      key={p.id}
                      onClick={() => addLine(p)}
                      className="group bg-white rounded-xl p-3 text-left border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all"
                    >
                      <div className="w-full h-16 rounded-lg bg-gradient-to-br from-indigo-50 to-slate-50 flex items-center justify-center text-indigo-300 mb-2 group-hover:text-indigo-500">
                        <Boxes className="w-6 h-6" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight min-h-[2.5rem]">
                        {p.name}
                      </h4>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-black text-indigo-700">
                          {price.toLocaleString("vi-VN")}
                        </span>
                        <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <Plus className="w-3 h-3" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {q && filtered.length === 0 && (
                <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400">
                  <Search className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-medium text-slate-600">Không tìm thấy</p>
                </div>
              )}
            </div>

            {/* RIGHT: Cart + Pay */}
            <div className="lg:col-span-5 xl:col-span-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-md sticky top-4">
                {/* Customer */}
                <div className="p-3 border-b border-slate-100">
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                    >
                      <option value="">Khách vãng lai</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.phone})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Cart Items */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700">GIỎ HÀNG</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                      {itemCount} món
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {lines.length === 0 ? (
                      <div className="py-8 text-center text-slate-300 text-xs">
                        Chưa có sản phẩm
                      </div>
                    ) : (
                      lines.map((l) => (
                        <div key={l.variantId} className="py-2 flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-900 truncate">{l.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {l.unitPrice.toLocaleString("vi-VN")} ₫ × {l.quantity}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => decreaseQty(l.variantId)}
                              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-6 text-center text-xs font-bold">{l.quantity}</span>
                            <button
                              onClick={() => increaseQty(l.variantId)}
                              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="text-right shrink-0 w-20">
                            <span className="text-xs font-bold text-slate-900">
                              {(l.quantity * l.unitPrice).toLocaleString("vi-VN")}
                            </span>
                          </div>

                          <button
                            onClick={() => removeLine(l.variantId)}
                            className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Total + Payment */}
                <div className="p-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500">Tổng:</span>
                    <span className="text-2xl font-black text-slate-900">
                      {total.toLocaleString("vi-VN")} ₫
                    </span>
                  </div>

                  {/* Quick cash buttons */}
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {[100000, 200000, 500000, 1000000].map((amt) => (
                      <button
                        key={amt}
                        disabled={!lines.length || amt < total}
                        onClick={() => {
                          // Quick cash: pay with this amount, no change calculation needed server-side
                          // Just use CASH method with the actual total
                          pay("CASH");
                        }}
                        className="py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40 text-[10px] font-bold text-slate-700 transition-colors"
                      >
                        {(amt / 1000).toFixed(0)}k
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      disabled={!lines.length}
                      onClick={() => pay("CASH")}
                      className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-white/50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    >
                      <Banknote className="w-4 h-4" />
                      Tiền mặt
                    </button>
                    <button
                      disabled={!lines.length}
                      onClick={() => pay("QR")}
                      className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-white/50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    >
                      <QrCode className="w-4 h-4" />
                      QR
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {scannerOpen && (
        <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setScannerOpen(false)} />
      )}
    </main>
  );
}
