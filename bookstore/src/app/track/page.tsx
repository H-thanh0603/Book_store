"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bike,
  Check,
  Package,
  Phone,
  Truck,
} from "lucide-react";

type OrderItem = { id: string; name: string; quantity: number; price: number };
type Stage = { label: string; time: string; done: boolean; desc: string };
type Shipment = { carrier: string | null; trackingNumber: string | null; status: string } | null;
type OrderData = {
  number: string;
  status: string;
  createdAt: string;
  total: number;
  storeName: string;
  shipment: Shipment;
  items: OrderItem[];
  stages: Stage[];
};

function money(v: number) {
  return `${v.toLocaleString("vi-VN")} ₫`;
}

export default function TrackPage() {
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!number.trim() || !phone.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ number: number.trim(), phone: phone.trim() });
      const res = await fetch(`/api/storefront/track?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedOrder(data.order ?? null);
      }
    } catch {}
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 pb-24 font-sans selection:bg-[#0284c7] selection:text-white">
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-[#0369a1] text-white px-4 py-2 text-xs font-bold shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-amber-300 text-amber-950 px-2 py-0.5 rounded-full text-[10px] uppercase font-black">
              MELIO EXPRESS
            </span>
            <span>📦 Hệ thống tra cứu vận đơn &amp; hành trình giao hàng thời gian thực</span>
          </div>
          <Link href="/shop" className="hover:underline text-[11px] hidden sm:inline">
            ← Quay lại siêu thị sách
          </Link>
        </div>
      </div>

      {/* 2. HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link href="/shop" className="flex items-center gap-2.5 group">
            <div className="size-11 rounded-2xl bg-[#0284c7] text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-black text-2xl text-slate-900 tracking-tight leading-none">
                  Melio
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-[#0284c7] text-white px-1.5 py-0.5 rounded">
                  Tracking
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tra Cứu Hành Trình Đơn Hàng</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/shop"
              className="px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
            >
              Tiếp tục mua hàng
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO SEARCH BOX */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-8">
        <div className="text-center space-y-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
            <Package className="w-3.5 h-3.5" /> Tra Cứu Vận Đơn Tự Động
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Theo Dõi Hành Trình Đơn Hàng
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
            Nhập <b>Mã đơn hàng</b> (VD: ORD-...) <b>và</b> Số điện thoại đặt hàng để kiểm tra tiến trình đóng gói và vị trí bưu kiện.
          </p>

          <form onSubmit={handleSearch} className="max-w-xl mx-auto pt-2 space-y-2">
            <div className="relative">
              <Package className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Mã đơn hàng (VD: ORD-2026-000123)"
                className="w-full bg-white border border-slate-300 rounded-2xl pl-10 pr-4 py-3.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-xs"
              />
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Số điện thoại đặt hàng"
                  autoComplete="tel"
                  className="w-full bg-white border border-slate-300 rounded-2xl pl-10 pr-4 py-3.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-xs"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3.5 rounded-2xl bg-[#0284c7] hover:bg-sky-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all shrink-0 flex items-center gap-2"
              >
                {loading ? "Đang tra cứu..." : "Tra Cứu Ngay"}
              </button>
            </div>
          </form>
        </div>

        {/* 4. RESULT TIMELINE & MAP */}
        {selectedOrder ? (
          <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-md border border-slate-200 space-y-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full">
                  MÃ VẬN ĐƠN: {selectedOrder.number}
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                  {selectedOrder.status === "COMPLETED"
                    ? "Giao Hàng Thành Công"
                    : selectedOrder.status === "CONFIRMED"
                    ? "Đang Vận Chuyển Giao Đến Bạn"
                    : "Đang Chuẩn Bị & Đóng Gói"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ngày đặt: {new Date(selectedOrder.createdAt).toLocaleDateString("vi-VN")} · Chi nhánh xuất phát: <b>{selectedOrder.storeName}</b>
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-400 block">Thu hộ COD khi nhận:</span>
                <span className="text-2xl font-black text-[#c83f49]">{money(selectedOrder.total)}</span>
              </div>
            </div>

            {/* 5-Step Visual Timeline */}
            <div className="relative">
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 relative z-10">
                {selectedOrder.stages.map((st, i) => (
                  <div key={i} className="flex flex-col sm:items-center text-left sm:text-center space-y-2">
                    <div
                      className={`size-10 rounded-2xl flex items-center justify-center font-bold text-xs shadow-xs transition-all ${
                        st.done
                          ? "bg-emerald-600 text-white ring-4 ring-emerald-100"
                          : "bg-slate-100 text-slate-400 border border-slate-200"
                      }`}
                    >
                      {st.done ? <Check className="w-5 h-5" /> : i + 1}
                    </div>
                    <div>
                      <b className={`block text-xs font-bold ${st.done ? "text-slate-900" : "text-slate-400"}`}>
                        {st.label}
                      </b>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{st.time}</span>
                      <p className="text-[11px] text-slate-500 mt-1 sm:line-clamp-2">{st.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Shipment info card */}
            <div className="rounded-2xl bg-gradient-to-r from-sky-900 to-indigo-950 text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
              <div className="flex items-center gap-3.5">
                <div className="size-12 rounded-2xl bg-sky-500/30 border border-sky-400/40 text-amber-300 flex items-center justify-center shrink-0">
                  <Bike className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <b className="text-sm font-black">Đơn Vị Vận Chuyển: Melio Express</b>
                    {selectedOrder.shipment && (
                      <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/30">
                        {selectedOrder.shipment.status}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-sky-200 mt-0.5">
                    {selectedOrder.shipment?.carrier ? (
                      <>
                        Hãng vận chuyển: <b>{selectedOrder.shipment.carrier}</b>
                        {selectedOrder.shipment.trackingNumber && (
                          <> · Mã bưu kiện: <b>{selectedOrder.shipment.trackingNumber}</b></>
                        )}
                      </>
                    ) : (
                      <>Hotline hỗ trợ: <b>19006868</b></>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="tel:19006868"
                  className="px-4 py-2 rounded-xl bg-white text-slate-900 font-bold text-xs flex items-center gap-1.5 shadow"
                >
                  <Phone className="w-3.5 h-3.5 text-sky-700" /> Gọi Hỗ Trợ
                </a>
              </div>
            </div>

            {/* Order items */}
            <div className="pt-2 border-t border-slate-100">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                Danh Sách Ấn Phẩm Trong Kiện ({selectedOrder.items.length} món)
              </h4>
              <div className="mt-3 space-y-2">
                {selectedOrder.items.map((it) => (
                  <div key={it.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <b className="block text-slate-900 line-clamp-1">{it.name}</b>
                      <span className="text-[11px] text-slate-500">Số lượng: x{it.quantity}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">{money(it.price * it.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : searched && !loading ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-xs border border-slate-200 space-y-3">
            <Package className="w-12 h-12 mx-auto text-slate-300" />
            <h3 className="text-lg font-bold text-slate-800">Không tìm thấy thông tin đơn hàng</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Vui lòng kiểm tra lại Mã đơn hàng (VD: ORD-...) <b>và</b> Số điện thoại bạn đã dùng khi đặt hàng. Cả hai phải trùng khớp với đơn hàng.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
