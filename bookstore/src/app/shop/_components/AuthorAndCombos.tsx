// Sections 7 + 8: AUTHOR SPOTLIGHT & COMBO BUNDLES (static editorial blocks)
import { CheckCircle2, Gift, ShoppingBag, Sparkles } from "lucide-react";
import type { AuthorSpotlightData, ComboBundle } from "./types";
import ProductCover from "./ProductCover";

export function AuthorSpotlightSection({ spotlight }: { spotlight: AuthorSpotlightData }) {
  return (
    <section className="rounded-3xl bg-gradient-to-br from-amber-50 via-white to-rose-50/60 p-8 sm:p-12 border border-amber-200/80 shadow-xs relative overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-4 text-center sm:text-left space-y-3">
          <span className="text-[10px] uppercase tracking-widest text-rose-700 bg-rose-100/80 px-3.5 py-1 rounded-full font-black inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#8c2d19]" /> TÁC GIẢ TIÊU ĐIỂM TUẦN
          </span>
          <h2 className="font-serif font-black text-2xl sm:text-4xl text-slate-900">{spotlight.name}</h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">{spotlight.bio}</p>
          <div className="p-4 rounded-2xl bg-white/80 border border-amber-200 text-xs font-serif italic text-amber-900 shadow-2xs">
            &ldquo;{spotlight.quote}&rdquo;
          </div>
        </div>

        <div className="lg:col-span-8 space-y-3">
          <b className="block text-xs uppercase tracking-wider text-[#8c2d19] font-bold">
            Tuyển Tập Tác Phẩm Nổi Bật Được Yêu Thích Nhất:
          </b>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {spotlight.notableBooks.map((bName, i) => (
              <div
                key={i}
                className="p-3.5 rounded-3xl bg-white border border-slate-200/80 shadow-2xs hover:shadow-xl hover:-translate-y-1.5 transition-all duration-200 text-center space-y-2 flex flex-col justify-between group cursor-pointer"
              >
                <div className="relative">
                  <ProductCover
                    id={`spotlight-${i}`}
                    name={bName}
                    categoryName="Văn học"
                    authorName={spotlight.name}
                  />
                </div>
                <span className="font-bold text-xs text-slate-900 group-hover:text-[#8c2d19] transition-colors block line-clamp-1">
                  {bName}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ComboBundlesSection({
  bundles,
  money,
  onAddCombo,
}: {
  bundles: ComboBundle[];
  money: (v: number) => string;
  onAddCombo: (bundle: ComboBundle) => void;
}) {
  const cardThemes = [
    { border: "border-amber-200", bg: "from-amber-50/50 to-white", tagBg: "bg-amber-500 text-white" },
    { border: "border-emerald-200", bg: "from-emerald-50/50 to-white", tagBg: "bg-emerald-600 text-white" },
    { border: "border-[#e8dac5]", bg: "from-[#faf4ea]/50 to-white", tagBg: "bg-[#8c2d19] text-white" },
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-[#8c2d19] font-black">
            COMBO SIÊU TIẾT KIỆM
          </span>
          <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900 mt-0.5">
            Mua Trọn Gói &amp; Tiết Kiệm Đến 30%
          </h2>
        </div>
        <span className="text-xs text-slate-500 font-medium">Đã bao gồm hộp quà &amp; Freeship toàn quốc</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {bundles.map((bundle, idx) => {
          const theme = cardThemes[idx % cardThemes.length];
          return (
            <div
              key={bundle.id}
              className={`p-6 rounded-3xl bg-gradient-to-b ${theme.bg} border ${theme.border} shadow-xs space-y-4 flex flex-col justify-between hover:shadow-xl hover:-translate-y-1.5 transition-all duration-200`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase ${theme.tagBg} px-3 py-1 rounded-full shadow-2xs`}>
                    {bundle.tag}
                  </span>
                  <Gift className="w-5 h-5 text-rose-500" />
                </div>

                <h3 className="font-bold text-lg text-slate-900 leading-snug">{bundle.title}</h3>
                <p className="text-xs text-slate-500">{bundle.desc}</p>

                <div className="p-3.5 rounded-2xl bg-white/90 border border-slate-200/80 space-y-2 text-xs">
                  <b className="block text-[11px] text-[#8c2d19] uppercase tracking-wider font-bold">Bao Gồm:</b>
                  {bundle.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-slate-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="line-clamp-1 font-medium">{it}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] text-slate-400 line-through block font-medium">
                    {money(bundle.originalPrice)}
                  </span>
                  <b className="text-xl font-black text-[#8c2d19]">{money(bundle.price)}</b>
                  <span className="block text-[10px] text-slate-400 mt-0.5">Giá gói tham chiếu — tính theo từng món thêm vào giỏ</span>
                </div>
                <button
                  onClick={() => onAddCombo(bundle)}
                  className="px-5 py-3 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Thêm Trọn Gói</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
