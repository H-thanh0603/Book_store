"use client";

import { useState } from "react";
import { useEscapeClose } from "./useEscapeClose";
import {
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  X,
  ShoppingBag,
} from "lucide-react";

export default function FlipbookReaderModal({
  productName,
  authorName,
  price,
  onClose,
  onAddToCart,
}: {
  productName: string;
  authorName?: string;
  price: number;
  onClose: () => void;
  onAddToCart?: () => void;
}) {
  useEscapeClose(true, onClose);
  const [currentPage, setCurrentPage] = useState(1);
  const [readingMode, setReadingMode] = useState<"sepia" | "light" | "dark">("sepia");
  const fontSize = "base" as const;
  const [ambientAudio, setAmbientAudio] = useState(false);

  const themeClasses = {
    sepia: "bg-[#fbf8f3] text-[#2c241d] border-[#ede5d8]",
    light: "bg-white text-slate-900 border-slate-200",
    dark: "bg-[#0f172a] text-slate-200 border-slate-800",
  };

  const fontClasses = {
    sm: "text-xs leading-relaxed",
    base: "text-sm leading-relaxed",
    lg: "text-base leading-relaxed",
  };

  const pages = [
    {
      chapter: "CHƯƠNG 1: KHỞI NGUYÊN",
      content:
        "Những bước chân đầu tiên trên con đường tìm kiếm chân lý luôn bắt đầu từ sự tĩnh lặng sâu kín nhất trong tâm hồn. Chúng ta đọc sách không phải để tích lũy thêm những ảo tưởng, mà để gột rửa những định kiến đã bám sâu qua năm tháng. Trong từng trang viết này, tác giả gửi gắm một niềm tin mãnh liệt vào sức mạnh khai phóng của tri thức và lòng trắc ẩn...",
    },
    {
      chapter: "CHƯƠNG 1 (TIẾP THEO): TIẾNG GỌI NỘI TÂM",
      content:
        "Cuộc sống không bao giờ đặt ra những thử thách quá sức chịu đựng của con người. Mỗi nghịch cảnh là một cơ hội để tôi luyện bản lĩnh và mài giũa chiều sâu nhân cách. Khi bạn nhìn lại những ngày giông bão đã qua, bạn sẽ nhận ra chính những khoảnh khắc ấy đã kiến tạo nên con người vững vàng của ngày hôm nay...",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl rounded-3xl p-6 sm:p-10 shadow-2xl border ${themeClasses[readingMode]} relative max-h-[90vh] overflow-y-auto space-y-6 animate-in zoom-in-95 duration-200 font-serif`}
      >
        {/* Top Controls */}
        <div className="flex items-center justify-between border-b border-inherit pb-4">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold opacity-75">
              ĐỌC THỬ TRÍCH ĐOẠN 3D
            </span>
            <h3 className="font-black text-xl leading-tight mt-0.5">{productName}</h3>
            {authorName && <p className="text-xs italic opacity-75">✍️ {authorName}</p>}
          </div>

          <div className="flex items-center gap-2">
            {/* Reading Mode Switcher */}
            <div className="flex bg-black/5 p-1 rounded-xl gap-1">
              <button
                onClick={() => setReadingMode("sepia")}
                className={`px-2 py-1 rounded-lg text-xs font-bold ${readingMode === "sepia" ? "bg-[#e8dac5] text-slate-900" : "opacity-60"}`}
                title="Giấy kem mộc"
              >
                📜 Kem
              </button>
              <button
                onClick={() => setReadingMode("light")}
                className={`px-2 py-1 rounded-lg text-xs font-bold ${readingMode === "light" ? "bg-white text-slate-900 shadow-xs" : "opacity-60"}`}
                title="Trắng tự nhiên"
              >
                ☀️ Sáng
              </button>
              <button
                onClick={() => setReadingMode("dark")}
                className={`px-2 py-1 rounded-lg text-xs font-bold ${readingMode === "dark" ? "bg-slate-800 text-white" : "opacity-60"}`}
                title="Chế độ đêm"
              >
                🌙 Đêm
              </button>
            </div>

            {/* Audio Ambiance */}
            <button
              onClick={() => setAmbientAudio(!ambientAudio)}
              className={`size-8 rounded-xl flex items-center justify-center border border-inherit ${ambientAudio ? "bg-[#c83f49] text-white" : ""}`}
              title="Âm thanh tiếng mưa & lật trang giấy"
            >
              {ambientAudio ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button onClick={onClose} className="size-8 rounded-xl bg-black/5 hover:bg-black/10 flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Page Content with Drop Cap */}
        <div className={`space-y-4 text-justify ${fontClasses[fontSize]}`}>
          <div className="text-center font-mono text-[10px] tracking-widest uppercase opacity-60 border-b border-inherit pb-2">
            {pages[currentPage - 1].chapter} · TRANG 0{currentPage} / 0{pages.length}
          </div>
          <p className="drop-cap pt-2">{pages[currentPage - 1].content}</p>
        </div>

        {/* Page navigation & Action */}
        <div className="pt-4 border-t border-inherit flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 rounded-xl bg-black/5 hover:bg-black/10 disabled:opacity-30 text-xs font-bold flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Trang trước
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))}
              disabled={currentPage === pages.length}
              className="px-3 py-2 rounded-xl bg-black/5 hover:bg-black/10 disabled:opacity-30 text-xs font-bold flex items-center gap-1"
            >
              Trang sau <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => {
              if (onAddToCart) onAddToCart();
              onClose();
            }}
            className="px-5 py-2.5 rounded-2xl bg-[#c83f49] hover:bg-rose-700 text-white font-bold text-xs shadow-md flex items-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" /> Đặt Mua Ấn Bản ({price.toLocaleString("vi-VN")} ₫)
          </button>
        </div>
      </div>
    </div>
  );
}
