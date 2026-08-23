"use client";

import {
  Compass,
  MapPin,
  Store,
  X,
} from "lucide-react";

export default function ShelfFinderModal({
  productName,
  categoryName,
  storeName,
  onClose,
}: {
  productName: string;
  categoryName: string;
  storeName: string;
  onClose: () => void;
}) {
  const isBook = categoryName.toLowerCase().includes("sách") || categoryName.toLowerCase().includes("văn học");
  const shelfCode = isBook ? "KỆ B3 · HÀNG 2 · TẦNG 1" : "KỆ D1 · HÀNG 1 · KHU VPP & ĐỒ CHƠI";
  const floorName = isBook ? "Tầng 1 (Khu Vực Văn Học & Sách Quốc Tế)" : "Tầng Trệt (Khu Vực VPP & Đồ Chơi Sáng Tạo)";

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-rose-50 text-[#c83f49] flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#c83f49]">
                SƠ ĐỒ VỊ TRÍ TẠI CỬA HÀNG
              </span>
              <h3 className="font-bold text-lg text-slate-900 leading-tight">
                Vị Trí Kệ Sách Thực Tế
              </h3>
            </div>
          </div>
          <button onClick={onClose} className="size-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Product & Store info */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
          <div className="text-slate-500">Tác phẩm / Mặt hàng:</div>
          <b className="text-slate-900 text-sm block line-clamp-1">{productName}</b>
          <div className="pt-1 flex items-center gap-1.5 text-emerald-700 font-semibold">
            <Store className="w-3.5 h-3.5" /> Chi nhánh: {storeName}
          </div>
        </div>

        {/* Simulated Floor Plan Grid */}
        <div className="p-4 rounded-2xl bg-[#18253f] text-white space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-amber-300 font-bold flex items-center gap-1">
              <Compass className="w-4 h-4" /> {floorName}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">MAP-V1</span>
          </div>

          <div className="grid grid-cols-4 gap-2 py-2">
            {["Kệ A1", "Kệ A2", "Kệ B1", "Kệ B2", "Kệ B3 (ĐÂY)", "Kệ C1", "Kệ D1", "Quầy Thu Ngân"].map((zone, i) => {
              const isTarget = zone.includes("B3") || (zone.includes("D1") && !isBook);
              return (
                <div
                  key={i}
                  className={`p-2.5 rounded-xl text-center text-[10px] font-bold border transition-all ${
                    isTarget
                      ? "bg-[#c83f49] text-white border-amber-300 shadow-lg scale-105 animate-pulse"
                      : "bg-white/10 text-slate-300 border-white/10"
                  }`}
                >
                  {zone}
                </div>
              );
            })}
          </div>

          <div className="p-3 rounded-xl bg-white/10 text-[11px] text-slate-300 flex items-center justify-between">
            <span>Tọa độ vị trí chính xác:</span>
            <b className="text-amber-300 font-mono font-black">{shelfCode}</b>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-[#18253f] hover:bg-[#c83f49] text-white font-bold text-xs shadow-md transition-all"
        >
          Đã Hiểu Vị Trí
        </button>
      </div>
    </div>
  );
}
