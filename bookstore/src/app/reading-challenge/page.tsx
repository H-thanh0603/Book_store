"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Award,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Heart,
  Plus,
  Quote,
  Share2,
  Sparkles,
  Star,
  Target,
  Trophy,
  User,
  X,
} from "lucide-react";

const mockUserBooks = [
  { id: "1", name: "Tôi Thấy Hoa Vàng Trên Cỏ Xanh", status: "completed", rating: 5, author: "Nguyễn Nhật Ánh" },
  { id: "2", name: "Dế Mèn Phiêu Lưu Ký", status: "completed", rating: 5, author: "Tô Hoài" },
  { id: "3", name: "Harry Potter và Hòn Đá Phù Thủy", status: "reading", progress: 65, author: "J.K. Rowling" },
  { id: "4", name: "One Piece Tập 101", status: "want_to_read", author: "Eiichiro Oda" },
];

const literaryQuotes = [
  { text: "Một cuốn sách hay trên giá sách là một người bạn thầm lặng nhưng trung thành nhất.", author: "Charles William Eliot" },
  { text: "Việc đọc sách đối với tâm trí cũng giống như việc tập thể dục đối với cơ thể.", author: "Joseph Addison" },
  { text: "Đọc sách là cách tuyệt vời nhất để du hành không gian và thời gian mà không cần rời khỏi căn phòng.", author: "Carl Sagan" },
];

function getStatusBadgeClass(status: string) {
  if (status === "completed") return "bg-emerald-100 text-emerald-950 font-bold";
  if (status === "reading") return "bg-amber-100 text-amber-950 font-bold";
  return "bg-stone-200 text-stone-900 font-bold";
}

export default function ReadingChallengePage() {
  const [goal, setGoal] = useState(20);
  const [completedCount, setCompletedCount] = useState(6);
  const [activeTab, setActiveTab] = useState<"all" | "reading" | "completed" | "want">("all");
  const [currentQuoteIdx, setCurrentQuoteIdx] = useState(0);
  const [copiedQuote, setCopiedQuote] = useState(false);

  const pct = Math.round((completedCount / goal) * 100);
  const activeQuote = literaryQuotes[currentQuoteIdx];

  return (
    <main className="min-h-screen bg-[#faf7f2] text-slate-900 pb-24 font-sans selection:bg-[#14532d] selection:text-white">
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-[#14532d] text-white px-4 py-2 text-xs font-bold shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-amber-300 text-amber-950 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black">
              GOODREADS &amp; MELIO
            </span>
            <span>📚 Thử thách đọc sách 2026 · Nuôi dưỡng thói quen đọc mỗi ngày</span>
          </div>
          <Link href="/shop" className="hover:underline text-[11px] hidden sm:inline text-emerald-200">
            ← Về Siêu Thị Sách
          </Link>
        </div>
      </div>

      {/* 2. HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-[#ede5d8] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link href="/reading-challenge" className="flex items-center gap-2.5 group">
            <div className="size-11 rounded-2xl bg-[#14532d] text-amber-300 flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-serif font-black text-2xl text-slate-900 tracking-tight leading-none">
                  Melio
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-[#14532d] text-white px-1.5 py-0.5 rounded">
                  Challenge
                </span>
              </div>
              <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Câu Lạc Bộ Bạn Đọc</p>
            </div>
          </Link>

          <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
            <Link href="/bestsellers" className="hover:text-emerald-700 hidden sm:inline">
              🏆 Bestsellers
            </Link>
            <Link href="/gift-finder" className="hover:text-emerald-700 hidden sm:inline">
              🎁 Tìm Quà Tặng
            </Link>
            <Link href="/stores" className="hover:text-emerald-700 hidden sm:inline">
              🏛️ Chi Nhánh &amp; Sự Kiện
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO GOAL TRACKER */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        <section className="rounded-3xl bg-gradient-to-r from-[#14532d] via-[#166534] to-[#0f3d23] text-white p-8 sm:p-12 shadow-2xl relative overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-8 items-center relative z-10">
            <div className="sm:col-span-8 space-y-4">
              <span className="inline-flex items-center gap-1.5 bg-amber-400 text-amber-950 px-3 py-1 rounded-full text-xs font-black uppercase">
                <Target className="w-4 h-4" /> MỤC TIÊU ĐỌC SÁCH 2026
              </span>
              <h1 className="font-serif font-black text-3xl sm:text-5xl leading-tight">
                Hành Trình Chinh Phục <br />
                <span className="text-amber-300">{goal} Cuốn Sách Trong Năm</span>
              </h1>
              <p className="text-xs sm:text-sm text-emerald-100 font-serif leading-relaxed italic">
                Bạn đã hoàn thành <b>{completedCount} / {goal} cuốn sách</b>. Chỉ còn 14 cuốn nữa để về đích trước ngày 31/12/2026!
              </p>
            </div>

            {/* Circular Progress Meter */}
            <div className="sm:col-span-4 flex justify-center">
              <div className="relative size-36 rounded-full bg-white/10 border-4 border-amber-400/40 flex flex-col items-center justify-center text-center shadow-2xl">
                <span className="font-mono font-black text-4xl text-amber-300">{pct}%</span>
                <span className="text-[10px] text-emerald-200 font-bold uppercase mt-0.5">Tiến độ năm</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. LITERARY QUOTE SHARING CARD */}
        <section className="rounded-3xl bg-white p-6 sm:p-8 paper-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-6 border border-[#ede5d8]">
          <div className="space-y-2 flex-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#8c2d19] flex items-center gap-1">
              <Quote className="w-3.5 h-3.5" /> Trích Dẫn Truyền Cảm Hứng Hôm Nay
            </span>
            <blockquote className="font-serif italic text-base sm:text-lg text-slate-800 leading-relaxed">
              &ldquo;{activeQuote.text}&rdquo;
            </blockquote>
            <span className="text-xs text-slate-500 font-serif block">— {activeQuote.author}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentQuoteIdx((prev) => (prev + 1) % literaryQuotes.length)}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
            >
              Đổi câu khác
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`"${activeQuote.text}" — ${activeQuote.author}`);
                setCopiedQuote(true);
                setTimeout(() => setCopiedQuote(false), 2000);
              }}
              className="px-4 py-2 rounded-xl bg-[#14532d] text-white text-xs font-bold flex items-center gap-1.5 shadow"
            >
              <Share2 className="w-3.5 h-3.5" /> {copiedQuote ? "Đã chép!" : "Chia sẻ"}
            </button>
          </div>
        </section>

        {/* 5. USER'S 3-TIER BOOKSHELF */}
        <section className="rounded-3xl bg-white p-6 sm:p-8 paper-card shadow-xs space-y-6 border border-[#ede5d8]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ede5d8] pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
                Tủ Sách Cá Nhân
              </span>
              <h2 className="text-2xl font-serif font-black text-slate-900 mt-0.5">
                Nhật Ký Đọc Sách Của Bạn
              </h2>
            </div>

            <div className="flex items-center gap-1.5">
              {[
                { id: "all", label: "Tất cả" },
                { id: "reading", label: "Đang đọc (1)" },
                { id: "completed", label: "Đã đọc (2)" },
                { id: "want", label: "Muốn đọc (1)" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    activeTab === tab.id
                      ? "bg-[#14532d] text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {mockUserBooks.map((b) => (
              <div key={b.id} className="p-4 rounded-2xl bg-[#faf8f5] border border-[#ede5d8] flex items-center justify-between gap-3">
                <div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${getStatusBadgeClass(b.status)}`}>
                    {b.status === "completed" ? "Đã xong" : b.status === "reading" ? "Đang đọc 65%" : "Muốn đọc"}
                  </span>
                  <h4 className="font-serif font-black text-sm text-slate-900 mt-1">{b.name}</h4>
                  <p className="text-xs text-slate-500 font-serif italic">✍️ {b.author}</p>
                </div>

                <div className="flex items-center gap-1 text-amber-500">
                  {b.rating && Array.from({ length: b.rating }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
