// Section 3: HERO CAMPAIGN SHOWCASE SPREAD
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Flame } from "lucide-react";
import type { FeaturedCampaign } from "./types";

export default function HeroCarousel({
  campaigns,
  currentSlide,
  onSlide,
  onPrev,
  onNext,
}: {
  campaigns: FeaturedCampaign[];
  currentSlide: number;
  onSlide: (i: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const activeHero = campaigns[currentSlide];
  if (!activeHero) return null;
  return (
    <section className="relative overflow-hidden rounded-3xl shadow-2xl border border-white/10">
      <div className={`relative bg-gradient-to-r ${activeHero.bg} p-8 sm:p-14 text-white min-h-[420px] flex flex-col justify-between overflow-hidden`}>
        {/* Ambient Graphics */}
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4 max-w-2xl">
          <div className="flex items-center gap-2.5">
            <span className={`font-mono text-[10px] font-black uppercase tracking-[0.25em] px-3 py-1 rounded-full shadow-xs ${activeHero.tagColor}`}>
              {activeHero.tag}
            </span>
            <span className="font-serif italic text-xs text-amber-200">{activeHero.badge}</span>
          </div>

          <h1 className="font-serif font-black text-3xl sm:text-6xl leading-[1.08] tracking-tight">
            {activeHero.title} <br />
            <span className="text-amber-200 font-serif">{activeHero.highlight}</span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 font-serif leading-relaxed italic max-w-xl">
            &ldquo;{activeHero.desc}&rdquo;
          </p>
        </div>

        {/* Actions & Slide Navigation */}
        <div className="relative z-10 pt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/15">
          <div className="flex items-center gap-3">
            <Link
              href={activeHero.ctaLink}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#fbf8f3] text-[#1c1917] font-serif font-bold text-xs sm:text-sm shadow-xl hover:bg-white hover:scale-105 transition-all"
            >
              {activeHero.ctaText} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href={activeHero.secondaryLink}
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-serif text-xs sm:text-sm backdrop-blur-md transition-colors"
            >
              <Flame className="w-4 h-4 text-amber-300" /> {activeHero.secondaryText}
            </Link>
          </div>

          {/* Slider Dots */}
          <div className="flex items-center gap-2">
            <button
              onClick={onPrev}
              aria-label="Chiến dịch trước"
              className="size-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 px-1">
              {campaigns.map((_, i) => (
                <button
                  key={i}
                  onClick={() => onSlide(i)}
                  aria-label={`Chuyển slide ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${currentSlide === i ? "w-6 bg-amber-400" : "w-2 bg-white/30"}`}
                />
              ))}
            </div>
            <button
              onClick={onNext}
              aria-label="Chiến dịch kế tiếp"
              className="size-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
