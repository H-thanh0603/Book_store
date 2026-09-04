// Section 3: HERO CAMPAIGN SHOWCASE SPREAD & PROMO BANNERS
// The carousel stops auto-rotating the moment the visitor interacts (arrows,
// slide pills, pause) and stays stopped — WCAG 2.2.2 auto-updating content.
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Flame,
  Gift,
  GraduationCap,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  ToyBrick,
  Trophy,
  Truck,
  Zap,
} from "lucide-react";
import type { FeaturedCampaign } from "./types";

export default function HeroCarousel({
  campaigns,
  currentSlide,
  onSlide,
  onPrev,
  onNext,
  paused,
  onPause,
  onResume,
}: {
  campaigns: FeaturedCampaign[];
  currentSlide: number;
  onSlide: (i: number) => void;
  onPrev: () => void;
  onNext: () => void;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
}) {
  const activeHero = campaigns[currentSlide] ?? campaigns[0];
  if (!activeHero) return null;

  return (
    <section className="space-y-6">
      {/* 1. MAIN HERO CAROUSEL */}
      <div className="relative overflow-hidden rounded-3xl shadow-2xl border border-white/20">
        <div
          className={`relative bg-gradient-to-r ${activeHero.bg} p-6 sm:p-12 lg:p-14 text-white min-h-[460px] flex flex-col justify-between overflow-hidden transition-all duration-700`}
        >
          {/* Ambient Glows */}
          <div className="absolute top-0 right-1/4 -mt-20 w-96 h-96 bg-white/15 rounded-full blur-3xl pointer-events-none animate-pulse-glow" />
          <div className="absolute bottom-0 right-0 -mb-20 -mr-20 w-80 h-80 bg-amber-400/20 rounded-full blur-3xl pointer-events-none" />

          {/* Top Banner Row */}
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Content Column */}
            <div className="lg:col-span-7 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[11px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-md ${activeHero.tagColor}`}>
                  {activeHero.tag}
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-md border border-white/30">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  {activeHero.badge}
                </span>
              </div>

              <h1 className="font-serif font-black text-3xl sm:text-5xl lg:text-6xl leading-[1.08] tracking-tight drop-shadow-sm">
                {activeHero.title} <br />
                <span className="text-yellow-200 drop-shadow-md">
                  {activeHero.highlight}
                </span>
              </h1>

              <p className="text-sm sm:text-base text-white/90 font-medium leading-relaxed max-w-xl drop-shadow-xs">
                {activeHero.desc}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <Link
                  href={activeHero.ctaLink}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-slate-900 font-bold text-xs sm:text-sm shadow-xl hover:bg-[#ffd56a] hover:text-[#1c1917] hover:scale-105 transition-all cursor-pointer group"
                >
                  <span>{activeHero.ctaText}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  href={activeHero.secondaryLink}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-black/20 hover:bg-black/30 text-white font-bold text-xs sm:text-sm backdrop-blur-md border border-white/30 transition-all hover:scale-105"
                >
                  <Flame className="w-4 h-4 text-[#ffd56a]" />
                  <span>{activeHero.secondaryText}</span>
                </Link>
              </div>
            </div>

            {/* Right 3D Showcase Column */}
            <div className="lg:col-span-5 hidden lg:flex justify-center relative">
              <div className="relative w-64 aspect-[3/4] rounded-2xl bg-gradient-to-tr from-white/20 via-white/10 to-transparent p-5 border-2 border-white/30 backdrop-blur-md shadow-2xl animate-float flex flex-col justify-between group">
                <div className="bookmark-ribbon-gold" />
                <div className="flex items-center justify-between text-[10px] font-mono font-black text-yellow-200 uppercase tracking-widest border-b border-white/20 pb-2">
                  <span>MELIO FLAGSHIP</span>
                  <span>BẢN ĐẶC BIỆT</span>
                </div>
                <div className="my-auto py-4 space-y-2">
                  <span className="text-xs uppercase font-bold text-amber-200 tracking-wider">Tuyển tập 2026</span>
                  <h3 className="font-serif font-black text-2xl text-white drop-shadow leading-tight">
                    {activeHero.highlight}
                  </h3>
                  <p className="text-[11px] text-white/80 line-clamp-2 italic">
                    Ấn bản biên tập cao cấp kèm bookmark kim loại mạ vàng dập nổi.
                  </p>
                </div>
                <div className="border-t border-white/20 pt-2 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-white/80">Chi nhánh toàn quốc</span>
                  <span className="font-mono font-black text-[#ffd56a]">Melio Flagship</span>
                </div>

                {/* Floating Micro Badge 1 */}
                <div className="absolute -bottom-4 -left-6 bg-white text-slate-900 px-3.5 py-2 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-2 text-xs font-bold animate-float-delayed">
                  <div className="size-6 rounded-full bg-[#faf4ea] text-[#8c2d19] flex items-center justify-center">
                    <Truck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="leading-none text-[11px]">Freeship 250K</div>
                    <small className="text-[10px] text-slate-400 font-normal">Giao hỏa tốc 2H</small>
                  </div>
                </div>

                {/* Floating Micro Badge 2 — static; no looping bounce */}
                <div className="absolute -top-4 -right-4 bg-[#d97706] text-white px-3 py-1.5 rounded-2xl shadow-xl font-black text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>TUYỂN TẬP 2026</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Slider Navigation Bar */}
          <div className="relative z-10 pt-6 mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/20">
            {/* Slide Indicator Pills */}
            <div className="flex items-center gap-2">
              {campaigns.map((camp, idx) => (
                <button
                  key={idx}
                  onClick={() => onSlide(idx)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    currentSlide === idx
                      ? "bg-white text-slate-950 shadow-md font-black scale-105"
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  <span className="size-2 rounded-full bg-current" />
                  <span className="hidden sm:inline">{camp.tag}</span>
                </button>
              ))}
            </div>

            {/* Arrows + rotation control */}
            <div className="flex items-center gap-2">
              <button
                onClick={onPrev}
                aria-label="Chiến dịch trước"
                className="size-10 rounded-full bg-white/20 hover:bg-white text-white hover:text-slate-950 flex items-center justify-center transition-all cursor-pointer shadow-md"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={onNext}
                aria-label="Chiến dịch kế tiếp"
                className="size-10 rounded-full bg-white/20 hover:bg-white text-white hover:text-slate-950 flex items-center justify-center transition-all cursor-pointer shadow-md"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={paused ? onResume : onPause}
                aria-label={paused ? "Bật tự động chuyển chiến dịch" : "Dừng tự động chuyển chiến dịch"}
                aria-pressed={paused}
                className="size-10 rounded-full bg-white/20 hover:bg-white text-white hover:text-slate-950 flex items-center justify-center transition-all cursor-pointer shadow-md"
              >
                {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. PROMOTIONAL FEATURE BANNERS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Banner 1: Deals */}
        <Link
          href="/deals"
          className="group relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-[#8c2d19] via-[#a63a1f] to-[#d97706] text-white shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs">
              GIẢM ĐẾN 50%
            </span>
            <div className="size-9 rounded-2xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Zap className="w-5 h-5 text-[#ffd56a] fill-[#ffd56a]" />
            </div>
          </div>
          <h3 className="font-bold text-base text-white group-hover:text-[#ffd56a] transition-colors">
            Săn Giờ Vàng Flash Deal
          </h3>
          <p className="text-xs text-white/80 mt-1 line-clamp-1">
            Đồng loạt giảm giá sốc hàng nghìn đầu sách &amp; VPP hôm nay
          </p>
          <div className="mt-3 flex items-center gap-1 text-xs font-bold text-[#ffd56a]">
            <span>Săn ngay</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Banner 2: Bestsellers */}
        <Link
          href="/bestsellers"
          className="group relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-[#d97706] via-[#b45309] to-[#8c2d19] text-white shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-black/20 backdrop-blur-xs">
              TOP 100 TUẦN NÀY
            </span>
            <div className="size-9 rounded-2xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Trophy className="w-5 h-5 text-white" />
            </div>
          </div>
          <h3 className="font-bold text-base text-white group-hover:text-[#ffd56a] transition-colors">
            Bảng Xếp Hạng Bestsellers
          </h3>
          <p className="text-xs text-white/90 mt-1 line-clamp-1">
            Những tác phẩm bán chạy nhất được độc giả bình chọn
          </p>
          <div className="mt-3 flex items-center gap-1 text-xs font-bold text-[#ffd56a]">
            <span>Xem bảng xếp hạng</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Banner 3: LEGO & Toys */}
        <Link
          href="/toys"
          className="group relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-[#574431] via-[#6b2113] to-[#8c2d19] text-white shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs">
              LEGO &amp; SANRIO 100%
            </span>
            <div className="size-9 rounded-2xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ToyBrick className="w-5 h-5 text-[#ffd56a]" />
            </div>
          </div>
          <h3 className="font-bold text-base text-white group-hover:text-[#ffd56a] transition-colors">
            Vương Quốc Đồ Chơi LEGO
          </h3>
          <p className="text-xs text-white/80 mt-1 line-clamp-1">
            Đồ chơi trí tuệ, mô hình lắp ráp &amp; gấu bông chính hãng
          </p>
          <div className="mt-3 flex items-center gap-1 text-xs font-bold text-[#ffd56a]">
            <span>Khám phá ngay</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Banner 4: Back To School */}
        <Link
          href="/back-to-school"
          className="group relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-[#14532d] via-[#166534] to-[#3f6212] text-white shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs">
              ƯU ĐÃI TỰU TRƯỜNG
            </span>
            <div className="size-9 rounded-2xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <GraduationCap className="w-5 h-5 text-[#ffd56a]" />
            </div>
          </div>
          <h3 className="font-bold text-base text-white group-hover:text-[#dcfce7] transition-colors">
            Hành Trang Khai Trường
          </h3>
          <p className="text-xs text-white/80 mt-1 line-clamp-1">
            Vở viết, bút Thiên Long, giấy Double A &amp; balo chống gù
          </p>
          <div className="mt-3 flex items-center gap-1 text-xs font-bold text-[#dcfce7]">
            <span>Chọn trọn bộ</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* 3. VALUE & PERKS STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3 p-2">
          <div className="size-10 rounded-2xl bg-[#faf4ea] text-[#8c2d19] flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">Giao Hỏa Tốc 2H</h4>
            <p className="text-[11px] text-slate-500">Miễn phí cho đơn từ 250K</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-2">
          <div className="size-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">100% Sách Thật</h4>
            <p className="text-[11px] text-slate-500">Bản quyền từ NXB uy tín</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-2">
          <div className="size-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">Đổi Trả Dễ Dàng</h4>
            <p className="text-[11px] text-slate-500">Miễn phí trong vòng 7 ngày</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-2">
          <div className="size-10 rounded-2xl bg-[#faf4ea] text-[#8c2d19] flex items-center justify-center shrink-0">
            <Gift className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">Bọc Quà &amp; Thiệp</h4>
            <p className="text-[11px] text-slate-500">Gói thủ công kèm thiệp vintage</p>
          </div>
        </div>
      </div>
    </section>
  );
}
