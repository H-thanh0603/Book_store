"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, MapPin, Sparkles, Tag, Truck } from "lucide-react";

const announcements = [
  {
    tag: "ƯU ĐÃI ĐẶC BIỆT",
    badgeColor: "bg-white text-[#8c2d19]",
    text: "Tặng Bookmark mạ vàng & Miễn phí giao hàng COD toàn quốc cho đơn từ 250.000 ₫",
  },
  {
    tag: "GIỜ VÀNG HÀNG NGÀY",
    badgeColor: "bg-[#ffd56a] text-[#6b2113]",
    text: "Giờ vàng săn deal: Ưu đãi trình bày mỗi ngày cho Sách Văn học, Manga & Đồ chơi LEGO!",
  },
  {
    tag: "VOUCHER HOT",
    badgeColor: "bg-white text-[#8c2d19]",
    text: "Nhập mã MELIOVIP giảm ngay 20.000 ₫ cho mọi đơn hàng từ 200.000 ₫ hôm nay",
  },
];

export default function AnnouncementBar({
  wishlistCount,
  storeName,
  onWishlist,
}: {
  wishlistCount: number;
  storeName: string;
  onWishlist: () => void;
}) {
  const [index, setIndex] = useState(0);

  // Slow rotation; the reader keeps control via the pause affordance next to
  // the message. Reduced-motion visitors see a static message via CSS.
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % announcements.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const current = announcements[index];

  return (
    <div className="bg-gradient-to-r from-[#8c2d19] via-[#a63a1f] to-[#8c2d19] text-white px-4 py-2 text-xs font-semibold shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        {/* Rotating Ticker */}
        <div className="flex items-center gap-2 text-center sm:text-left transition-all duration-300">
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black tracking-wider ${current.badgeColor}`}>
            {current.tag}
          </span>
          <span className="font-medium text-[11px] sm:text-xs flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#ffd56a] shrink-0" />
            {current.text}
          </span>
        </div>

        {/* Quick Utility Links */}
        <div className="flex items-center gap-3 text-[11px] font-bold">
          <Link
            href="/deals"
            className="inline-flex items-center gap-1 hover:text-[#ffd56a] transition-colors bg-white/15 hover:bg-white/25 px-2 py-0.5 rounded-full backdrop-blur-xs"
          >
            <Tag className="w-3 h-3 text-[#ffd56a]" /> Săn Deal
          </Link>
          <Link
            href="/track"
            className="inline-flex items-center gap-1 hover:text-[#ffd56a] transition-colors hidden md:inline-flex"
          >
            <Truck className="w-3.5 h-3.5 text-[#ffd56a]" /> Tra cứu đơn
          </Link>
          <button
            onClick={onWishlist}
            className="inline-flex items-center gap-1 hover:text-[#ffd56a] transition-colors cursor-pointer"
          >
            <Heart className={`w-3.5 h-3.5 ${wishlistCount > 0 ? "fill-[#ffd56a] text-[#ffd56a]" : "text-[#ffd56a]"}`} />
            Tủ sách ({wishlistCount})
          </button>
          <span className="inline-flex items-center gap-1 bg-black/20 px-2.5 py-0.5 rounded-full text-white font-medium border border-white/20">
            <MapPin className="w-3 h-3 text-[#ffd56a]" />
            {storeName}
          </span>
        </div>
      </div>
    </div>
  );
}
