"use client";

import { useEffect, useState } from "react";
import {
  Trophy,
  PartyPopper,
  X,
  CalendarCheck2,
} from "lucide-react";

const prizes = [
  { label: "Voucher 20k", color: "#c83f49" },
  { label: "Freeship Đơn 150k", color: "#18253f" },
  { label: "Bookmark Mạ Vàng", color: "#d97706" },
  { label: "+500 Xu Melio", color: "#059669" },
  { label: "Giảm 15% Manga", color: "#7c3aed" },
  { label: "Quà Bí Mật Thủ Thư", color: "#db2777" },
];
const SEGMENT_DEG = 360 / prizes.length;

export default function LuckyWheelModal({ onRewardWon }: { onRewardWon?: (reward: string) => void }) {
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [wonPrize, setWonPrize] = useState<string | null>(null);
  const checkedDays = [true, true, true, false, false, false, false];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function spinWheel() {
    if (spinning) return;
    setSpinning(true);
    setWonPrize(null);

    // Draw the prize FIRST, then land the pointer mid-segment so what the wheel
    // shows always matches the announced result.
    const prizeIdx = Math.floor(Math.random() * prizes.length);
    const currentMod = ((rotation % 360) + 360) % 360;
    const targetMid = prizeIdx * SEGMENT_DEG + SEGMENT_DEG / 2;
    const delta = (((360 - targetMid) % 360) - currentMod + 720) % 360;
    const newRot = rotation + 1440 + delta;
    setRotation(newRot);

    setTimeout(() => {
      setSpinning(false);
      const prize = prizes[prizeIdx].label;
      setWonPrize(prize);
      if (onRewardWon) onRewardWon(prize);
    }, 3200);
  }

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 size-12 rounded-full bg-gradient-to-tr from-[#d97706] via-[#c83f49] to-[#8c2d19] text-white shadow-2xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center border-2 border-white"
        title="Vòng quay may mắn & Điểm danh nhận quà"
      >
        <Trophy className="w-5 h-5" />
      </button>

      {/* Modal Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div role="dialog" aria-modal="true" aria-label="Vòng quay may mắn" className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 text-center relative space-y-5 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-5 right-5 size-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 px-2.5 py-0.5 rounded-full">
                <PartyPopper className="w-3.5 h-3.5" /> VÒNG QUAY TRI THỨC
              </span>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                Quay Thưởng &amp; Nhận Quà
              </h3>
              <p className="text-xs text-slate-500">Mỗi ngày nhận 1 lượt quay miễn phí 100% trúng thưởng</p>
            </div>

            {/* Wheel Canvas Graphic */}
            <div className="relative size-56 sm:size-64 mx-auto my-4 flex items-center justify-center">
              {/* Pointer */}
              <div className="absolute -top-3 z-20 w-0 h-0 border-x-8 border-x-transparent border-t-16 border-t-rose-600 drop-shadow-md" />

              <div
                className="size-full rounded-full border-4 border-amber-400 shadow-xl overflow-hidden relative transition-transform duration-[3000ms] ease-out"
                style={{ transform: `rotate(${rotation}deg)` }}
              >
                {prizes.map((p, i) => {
                  const deg = (360 / prizes.length) * i;
                  return (
                    <div
                      key={i}
                      className="absolute inset-0 flex items-start justify-center pt-3 text-[10px] font-black text-white"
                      style={{
                        transform: `rotate(${deg}deg)`,
                        transformOrigin: "center center",
                        backgroundColor: p.color,
                        clipPath: "polygon(50% 50%, 0 0, 100% 0)",
                      }}
                    >
                      <span className="transform rotate-90 mt-4 line-clamp-1">{p.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Center Spin Button */}
              <button
                onClick={spinWheel}
                disabled={spinning}
                className="absolute z-10 size-14 rounded-full bg-slate-900 hover:bg-rose-600 text-white font-black text-xs shadow-xl flex items-center justify-center border-2 border-white transition-all hover:scale-105 active:scale-95 disabled:opacity-75"
              >
                {spinning ? "..." : "QUAY"}
              </button>
            </div>

            {/* Won Prize Celebration */}
            {wonPrize && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 animate-in zoom-in-90 duration-150">
                🎉 Chúc mừng bạn đã trúng: <b className="text-rose-600">{wonPrize}</b>!
              </div>
            )}

            {/* 7-Day Streak Check-in */}
            <div className="pt-2 border-t border-slate-100 text-left space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1">
                  <CalendarCheck2 className="w-3.5 h-3.5 text-emerald-600" /> Điểm danh 7 ngày nhận quà lớn:
                </span>
                <span className="text-emerald-700">3/7 ngày</span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {checkedDays.map((checked, idx) => (
                  <div
                    key={idx}
                    className={`py-1.5 rounded-xl text-center text-[10px] font-bold ${
                      checked
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-slate-50 text-slate-400 border border-slate-200"
                    }`}
                  >
                    Ngày {idx + 1}
                    <div className="text-[9px] mt-0.5">{checked ? "✓" : "+50đ"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
