// Section 1: TOP ANNOUNCEMENT BAR
import Link from "next/link";
import { Heart, MapPin, Truck } from "lucide-react";

export default function AnnouncementBar({
  wishlistCount,
  storeName,
  onWishlist,
}: {
  wishlistCount: number;
  storeName: string;
  onWishlist: () => void;
}) {
  return (
    <div className="bg-[#1c1917] text-[#e7ded1] px-4 py-2 text-xs font-bold shadow-xs border-b border-white/10">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5">
        <div className="flex items-center gap-2 text-center sm:text-left">
          <span className="bg-[#c83f49] text-white px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black tracking-wider">
            FLAGSHIP STORE 2026
          </span>
          <span className="font-serif italic">
            Tặng Bookmark mạ vàng dập nổi &amp; Miễn phí giao hàng COD toàn quốc cho đơn từ <b>250.000 ₫</b>
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-[#c9bea9]">
          <Link href="/track" className="inline-flex items-center gap-1 hover:text-white transition-colors">
            <Truck className="w-3.5 h-3.5 text-amber-300" /> Tra cứu đơn hàng
          </Link>
          <button
            onClick={onWishlist}
            className="inline-flex items-center gap-1 hover:text-white transition-colors"
          >
            <Heart className="w-3.5 h-3.5 fill-[#c83f49] text-[#c83f49]" />
            Tủ sách cá nhân ({wishlistCount})
          </button>
          <span className="inline-flex items-center gap-1 bg-white/10 px-2.5 py-0.5 rounded-full text-white font-serif">
            <MapPin className="w-3 h-3 text-amber-300" />
            {storeName}
          </span>
        </div>
      </div>
    </div>
  );
}
