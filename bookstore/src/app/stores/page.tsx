"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Coffee,
  Compass,
  Heart,
  MapPin,
  Navigation,
  Phone,
  QrCode,
  Search,
  Sparkles,
  Store,
  Ticket,
  Users,
  Wifi,
  X,
} from "lucide-react";

const storeBranches = [
  {
    id: "nh",
    code: "NH",
    name: "Nhà Sách Melio Nguyễn Huệ (Flagship Store)",
    address: "124 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM",
    phone: "028 3822 6868",
    hours: "08:00 - 22:00 (Mở cửa cả tuần)",
    amenities: ["Cafe Sách Không Gian Mở", "Khu Đồ Chơi Trải Nghiệm", "Wifi Tốc Độ Cao", "Bãi Đậu Xe Ô Tô"],
    highlight: "Không gian 3 tầng lầu rộng 1.200m² với hơn 50.000 đầu sách bản quyền.",
  },
  {
    id: "td",
    code: "TD",
    name: "Nhà Sách Melio Tân Định",
    address: "387 Hai Bà Trưng, Phường 8, Quận 3, TP.HCM",
    phone: "028 3820 4567",
    hours: "08:00 - 21:30",
    amenities: ["Khu Đọc Sách Thiếu Nhi", "Quầy Văn Phòng Phẩm", "Gói Quà Nghệ Thuật"],
    highlight: "Góc phố đọc sách ấm cúng với đầy đủ dụng cụ học tập Thiên Long và Manga.",
  },
  {
    id: "hk",
    code: "HK",
    name: "Nhà Sách Melio Hoàn Kiếm (Hà Nội)",
    address: "45 Đinh Lễ, Phường Tràng Tiền, Quận Hoàn Kiếm, Hà Nội",
    phone: "024 3936 8888",
    hours: "08:00 - 22:00",
    amenities: ["Trà Đạo & Không Gian Đọc", "Sách Ngoại Văn Hiếm", "Ký Tặng Sách Cuối Tuần"],
    highlight: "Nằm ngay phố sách Đinh Lễ cổ kính, hội tụ những ấn bản bìa cứng nghệ thuật.",
  },
];

const upcomingEvents = [
  {
    id: "ev1",
    title: "Buổi Giao Lưu Tác Giả & Ký Tặng Sách Mùa Thu 2026",
    speaker: "Nhà văn Nguyễn Nhật Ánh & Hội đồng Biên tập NXB Trẻ",
    time: "09:00 - 11:30 · Thứ Bảy, 30/08/2026",
    location: "Sảnh Tầng 2 · Chi nhánh Nguyễn Huệ (Q.1, TP.HCM)",
    seatsLeft: 18,
  },
  {
    id: "ev2",
    title: "Workshop Sáng Tạo: Xếp Hình LEGO STEAM & Tư Duy Không Gian",
    speaker: "Chuyên gia Giáo dục LEGO Education Vietnam",
    time: "15:00 - 17:00 · Chủ Nhật, 31/08/2026",
    location: "Khu Vui Chơi Trẻ Em · Chi nhánh Tân Định (Q.3, TP.HCM)",
    seatsLeft: 8,
  },
];

export default function StoresPage() {
  const [registeredEvent, setRegisteredEvent] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-[#fbf9f5] text-slate-900 pb-24 font-sans selection:bg-[#18253f] selection:text-white">
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-[#18253f] text-white px-4 py-2 text-xs font-bold shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-amber-400 text-amber-950 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black">
              HỆ THỐNG SIÊU THỊ
            </span>
            <span>🏛️ Chuỗi không gian văn hóa đọc &amp; Workshop giao lưu tác giả cuối tuần</span>
          </div>
          <Link href="/shop" className="hover:underline text-[11px] hidden sm:inline text-amber-200">
            ← Về Cửa Hàng Trực Tuyến
          </Link>
        </div>
      </div>

      {/* 2. HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-[#ede5d8] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link href="/stores" className="flex items-center gap-2.5 group">
            <div className="size-11 rounded-2xl bg-[#18253f] text-amber-400 flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-serif font-black text-2xl text-slate-900 tracking-tight leading-none">
                  Melio
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-[#18253f] text-white px-1.5 py-0.5 rounded">
                  Locations
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Hệ Thống Chi Nhánh &amp; Sự Kiện</p>
            </div>
          </Link>

          <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
            <Link href="/bestsellers" className="hover:text-amber-700 hidden sm:inline">
              🏆 Bestsellers
            </Link>
            <Link href="/gift-finder" className="hover:text-amber-700 hidden sm:inline">
              🎁 Tìm Quà Tặng
            </Link>
            <Link href="/reading-challenge" className="hover:text-amber-700 hidden sm:inline">
              👥 Thử Thách Đọc
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO SHOWCASE */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-10">
        <section className="rounded-3xl bg-gradient-to-r from-[#18253f] via-[#1f3052] to-[#121b2d] text-white p-8 sm:p-14 shadow-2xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-1.5 bg-amber-400 text-amber-950 px-3 py-1 rounded-full text-xs font-black uppercase">
              <MapPin className="w-4 h-4" /> ĐIỂM HẸN VĂN HÓA ĐỌC
            </span>
            <h1 className="font-serif font-black text-3xl sm:text-5xl leading-tight">
              Không Gian Sách Thư Thái <br />
              <span className="text-amber-300">Giữa Lòng Đô Thị</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-serif leading-relaxed italic">
              Nơi bạn có thể ngồi thưởng thức một tách trà ấm, chạm tay vào từng trang sách thơm mùi mực in và tham gia các buổi giao lưu tác giả đầy cảm hứng.
            </p>
          </div>
        </section>

        {/* 4. WORKSHOP & AUTHOR EVENTS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#ede5d8] pb-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#c83f49]">
                SỰ KIỆN SẮP DIỄN RA
              </span>
              <h2 className="font-serif font-black text-2xl text-slate-900 mt-0.5">
                Lịch Workshop &amp; Giao Lưu Tác Giả
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-serif italic">Đăng ký giữ chỗ miễn phí</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingEvents.map((ev) => (
              <div
                key={ev.id}
                className="p-6 rounded-3xl bg-white border border-[#ede5d8] shadow-xs space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full">
                    CÒN {ev.seatsLeft} CHỖ TRỐNG
                  </span>
                  <h3 className="font-serif font-black text-lg text-slate-900 leading-snug">{ev.title}</h3>
                  <p className="text-xs text-slate-600 font-serif">🎙️ Diễn giả: <b>{ev.speaker}</b></p>
                  <p className="text-xs text-slate-500 font-mono">⏰ {ev.time}</p>
                  <p className="text-xs text-slate-500">📍 {ev.location}</p>
                </div>

                {registeredEvent === ev.id ? (
                  <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold text-center border border-emerald-200 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Đã gửi vé mời điện tử về điện thoại của bạn!
                  </div>
                ) : (
                  <button
                    onClick={() => setRegisteredEvent(ev.id)}
                    className="w-full py-3 rounded-2xl bg-[#18253f] hover:bg-[#c83f49] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <Ticket className="w-4 h-4" /> Đăng Ký Tham Gia Miễn Phí
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 5. PHYSICAL STORE BRANCHES */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#ede5d8] pb-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#18253f]">
                HỆ THỐNG NHÀ SÁCH
              </span>
              <h2 className="font-serif font-black text-2xl text-slate-900 mt-0.5">
                Các Chi Nhánh Đang Mở Cửa
              </h2>
            </div>
            <span className="text-xs text-emerald-700 font-bold">● Đang Hoạt Động (8:00 - 22:00)</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {storeBranches.map((st) => (
              <div
                key={st.id}
                className="p-6 rounded-3xl bg-white border border-[#ede5d8] shadow-xs space-y-4 flex flex-col justify-between hover:shadow-xl transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-black bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      MÃ: {st.code}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">📞 {st.phone}</span>
                  </div>

                  <h3 className="font-serif font-black text-base text-slate-900 leading-snug">{st.name}</h3>
                  <p className="text-xs text-slate-600 font-serif leading-relaxed">📍 {st.address}</p>
                  <p className="text-xs text-slate-500 italic font-serif">&ldquo;{st.highlight}&rdquo;</p>

                  {/* Amenities */}
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {st.amenities.map((am, i) => (
                      <span key={i} className="text-[10px] font-bold bg-[#faf7f2] border border-[#ede5d8] text-slate-700 px-2 py-0.5 rounded-md">
                        ✓ {am}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <a
                    href="https://maps.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Navigation className="w-3.5 h-3.5 text-blue-600" /> Chỉ Đường Google Maps
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
