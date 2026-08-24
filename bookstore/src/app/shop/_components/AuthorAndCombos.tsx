// Sections 7 + 8: AUTHOR SPOTLIGHT & COMBO BUNDLES (static editorial blocks)
import { CheckCircle2, Gift, ShoppingBag } from "lucide-react";
import type { AuthorSpotlightData, ComboBundle } from "./types";

export function AuthorSpotlightSection({ spotlight }: { spotlight: AuthorSpotlightData }) {
  return (
    <section className="rounded-3xl bg-[#faf4ea] p-8 sm:p-12 border border-[#e8dac5] shadow-xs relative overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-4 text-center sm:text-left space-y-3">
          <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] bg-white px-3 py-1 rounded-full border border-[#e8dac5] font-bold inline-block">
            TÁC GIẢ TIÊU ĐIỂM TRONG TUẦN
          </span>
          <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900">{spotlight.name}</h2>
          <p className="text-xs text-slate-600 font-serif leading-relaxed">{spotlight.bio}</p>
          <div className="p-4 rounded-2xl bg-white border border-[#e8dac5] text-xs font-serif italic text-[#574431]">
            &ldquo;{spotlight.quote}&rdquo;
          </div>
        </div>

        <div className="lg:col-span-8 space-y-3 font-serif">
          <b className="block text-xs uppercase tracking-wider text-[#8c2d19]">
            Tuyển Tập Tác Phẩm Nổi Bật Được Yêu Thích Nhất:
          </b>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {spotlight.notableBooks.map((bName, i) => (
              <div
                key={i}
                className="p-4 rounded-2xl bg-white border border-[#e8dac5] shadow-2xs hover:shadow-md transition-all text-center space-y-2 flex flex-col justify-between"
              >
                <div className="aspect-[4/5] rounded-xl bg-[#1c1917] text-white p-3 flex flex-col justify-between text-left">
                  <span className="text-[8px] uppercase text-amber-300 font-mono">BẢN IN #{i + 1}</span>
                  <h4 className="font-black text-xs line-clamp-3 text-amber-100">{bName}</h4>
                  <span className="text-[8px] italic text-slate-400">Nguyễn Nhật Ánh</span>
                </div>
                <span className="font-bold text-xs text-slate-900 block line-clamp-1">{bName}</span>
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
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#ede5d8] pb-3">
        <div>
          <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
            COMBO SIÊU TIẾT KIỆM
          </span>
          <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900 mt-0.5">
            Mua Trọn Gói &amp; Tiết Kiệm Đến 30%
          </h2>
        </div>
        <span className="text-xs text-slate-500 font-serif italic">Đã gồm hộp quà &amp; Freeship</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {bundles.map((bundle) => (
          <div
            key={bundle.id}
            className="p-6 rounded-3xl bg-white paper-card shadow-xs space-y-4 flex flex-col justify-between hover:shadow-xl transition-all"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase bg-[#8c2d19] text-white px-2.5 py-0.5 rounded-full">
                  {bundle.tag}
                </span>
                <Gift className="w-4 h-4 text-amber-600" />
              </div>

              <h3 className="font-serif font-black text-lg text-slate-900 leading-snug">{bundle.title}</h3>
              <p className="text-xs text-slate-500 font-serif">{bundle.desc}</p>

              <div className="p-3.5 rounded-2xl bg-[#faf7f2] border border-[#ede5d8] space-y-1.5 text-xs font-serif">
                <b className="block text-[11px] text-[#8c2d19] uppercase tracking-wider">Bao Gồm:</b>
                {bundle.items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-slate-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="line-clamp-1">{it}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-[#ede5d8] flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] text-slate-400 line-through block">{money(bundle.originalPrice)}</span>
                <b className="text-lg font-serif font-black text-[#c83f49]">{money(bundle.price)}</b>
              </div>
              <button
                onClick={() => onAddCombo(bundle)}
                className="px-4 py-2.5 rounded-xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-serif font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
              >
                <ShoppingBag className="w-3.5 h-3.5" /> Mua Combo
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
