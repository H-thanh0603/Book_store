"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  GraduationCap,
  PenTool,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";

type Variant = { id: string; name: string; sku: string; price: number; available: number };
type Product = {
  id: string;
  name: string;
  description: string | null;
  category: { id: string; name: string };
  brand?: { name: string } | null;
  variants: Variant[];
};
type Catalog = { products: Product[]; categories: { id: string; name: string }[]; stores: { id: string; name: string; code: string }[]; storeId: string };
type CartLine = { variantId: string; productId: string; name: string; category: string; price: number; quantity: number; available: number };

const CART_KEY = "melio.storefront.cart.v1";

const schoolGrades = [
  { id: "all", title: "Toàn Bộ Đồ Dùng", desc: "Tất cả sách, vở, bút viết & cặp học sinh" },
  { id: "cap1", title: "Cấp 1 · Tiểu Học (Lớp 1-5)", desc: "Vở ô ly 200 trang, bút máy nét hoa, balo chống gù, màu vẽ" },
  { id: "cap2", title: "Cấp 2 · THCS (Lớp 6-9)", desc: "Bút bi Thiên Long, giấy A4 kiểm tra, compa, máy tính bỏ túi" },
  { id: "cap3", title: "Cấp 3 & Đại Học", desc: "Giấy in Double A, bút highlight dạ quang, sổ còng cao cấp" },
];

const schoolChecklistItems = [
  { id: "vo", name: "10 Quyển Vở Ô Ly 200 Trang", price: 250000, checked: true },
  { id: "but", name: "1 Hộp Bút Bi Thiên Long TL-027 (20 cây)", price: 62000, checked: true },
  { id: "giay", name: "1 Ram Giấy Double A 70gsm (500 tờ)", price: 58000, checked: true },
  { id: "mau", name: "1 Hộp Màu Nước Mỹ Thuật 12 Màu", price: 78000, checked: true },
  { id: "balo", name: "1 Balo Học Sinh 20L Siêu Nhẹ", price: 349000, checked: false },
];

function money(v: number) {
  return `${v.toLocaleString("vi-VN")} ₫`;
}

export default function BackToSchoolPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [checklist, setChecklist] = useState(schoolChecklistItems);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setCart(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]")); } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    fetch("/api/storefront")
      .then((r) => r.json())
      .then((d) => setCatalog(d))
      .catch(() => {});
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function toggleChecklistItem(id: string) {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  }

  const checklistTotal = checklist
    .filter((item) => item.checked)
    .reduce((sum, item) => sum + item.price, 0);

  function addChecklistToCart() {
    showToast("🎒 Đã thêm trọn bộ combo đồ dùng học sinh vào giỏ hàng!");
    setCartOpen(true);
  }

  function addToCart(p: Product) {
    const v = p.variants[0];
    if (!v || v.available <= 0) return;
    setCart((lines) => {
      const cur = lines.find((l) => l.variantId === v.id);
      if (cur) return lines.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...lines, { variantId: v.id, productId: p.id, name: p.name, category: p.category.name, price: v.price, quantity: 1, available: v.available }];
    });
    showToast(`✨ Đã thêm "${p.name}" vào giỏ hàng!`);
    setCartOpen(true);
  }

  const products = useMemo(() => catalog?.products ?? [], [catalog?.products]);
  const schoolProducts = useMemo(() => {
    return products.filter(
      (p) =>
        p.category.name.toLowerCase().includes("văn phòng phẩm") ||
        p.category.name.toLowerCase().includes("mỹ thuật") ||
        p.category.name.toLowerCase().includes("lifestyle") ||
        p.brand?.name?.toLowerCase().includes("thiên long") ||
        p.brand?.name?.toLowerCase().includes("double a")
    );
  }, [products]);

  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = cart.reduce((sum, l) => sum + l.quantity * l.price, 0);

  return (
    <main className="min-h-screen bg-[#f7fafc] text-slate-900 pb-24 font-sans selection:bg-[#059669] selection:text-white">
      {/* 1. TOP ANNOUNCEMENT */}
      <div className="bg-[#059669] text-white px-4 py-2 text-xs font-black shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-amber-300 text-slate-950 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black">
              MÙA TỰU TRƯỜNG 2026
            </span>
            <span>🎒 Trọn bộ dụng cụ học tập, vở ô ly, bút Thiên Long &amp; Balo chống gù giảm đến 40%</span>
          </div>
          <Link href="/shop" className="hover:underline hidden sm:inline text-[11px]">
            ← Về Siêu Thị Sách
          </Link>
        </div>
      </div>

      {/* 2. HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-emerald-100 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link href="/back-to-school" className="flex items-center gap-2.5 group">
            <div className="size-11 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-600 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-black text-2xl text-slate-900 tracking-tight leading-none">
                  Melio
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                  School Hub
                </span>
              </div>
              <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Hành Trang Đến Trường</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/toys" className="hidden sm:inline-block text-xs font-bold text-slate-600 hover:text-emerald-600">
              🧸 Đồ Chơi Cho Bé
            </Link>
            <Link href="/deals" className="hidden sm:inline-block text-xs font-bold text-slate-600 hover:text-emerald-600">
              ⚡ Săn Giờ Vàng
            </Link>
            <button
              onClick={() => setCartOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md hover:scale-105 transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Giỏ hàng ({itemCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* 3. HERO BANNER */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#064e3b] via-[#047857] to-[#0f766e] text-white p-8 sm:p-14 shadow-2xl">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-96 h-96 bg-amber-400/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 bg-amber-400 text-slate-950 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-sm">
              <GraduationCap className="w-4 h-4" /> MÙA KHAI TRƯỜNG RỘN RÀNG
            </div>
            <h1 className="font-serif font-black text-3xl sm:text-5xl leading-tight">
              Tự Tin Bước Vào Năm Học Mới <br />
              <span className="text-amber-300">Cùng Bộ Dụng Cụ Học Tập Chuẩn</span>
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100 leading-relaxed max-w-xl">
              Cung cấp đầy đủ vở viết, bút Thiên Long chính hãng, giấy Double A và balo chống gù chuẩn y khoa bảo vệ cột sống cho học sinh sinh viên.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <a
                href="#combo-checklist"
                className="px-6 py-3.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm shadow-xl transition-all hover:scale-105"
              >
                Xem danh sách trọn bộ dụng cụ
              </a>
              <div className="flex items-center gap-1.5 text-xs text-emerald-200 font-bold bg-white/10 px-3.5 py-2.5 rounded-full backdrop-blur-md">
                <ShieldCheck className="w-4 h-4 text-amber-300" /> 100% Sản phẩm chính hãng Thiên Long, Double A
              </div>
            </div>
          </div>
        </section>

        {/* 4. INTERACTIVE SCHOOL CHECKLIST */}
        <section id="combo-checklist" className="rounded-3xl bg-white p-6 sm:p-8 shadow-xs border border-emerald-100 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-100 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                Chuẩn Bị Nhanh Trong 1 Phút
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                Checklist Dụng Cụ Học Tập Cho Bé
              </h2>
            </div>
            <p className="text-xs text-slate-500">Tích chọn các món cần mua và thêm trọn bộ chỉ với 1 click</p>
          </div>

          <div className="space-y-3">
            {checklist.map((item) => (
              <div
                key={item.id}
                onClick={() => toggleChecklistItem(item.id)}
                className={`p-4 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  item.checked
                    ? "bg-emerald-50/70 border-emerald-300 shadow-2xs"
                    : "bg-slate-50 border-slate-200 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`size-6 rounded-lg flex items-center justify-center text-white ${
                      item.checked ? "bg-emerald-600" : "bg-slate-300"
                    }`}
                  >
                    {item.checked && <Check className="w-4 h-4" />}
                  </div>
                  <span className="font-bold text-xs sm:text-sm text-slate-900">{item.name}</span>
                </div>
                <span className="font-mono font-black text-sm text-emerald-700">{money(item.price)}</span>
              </div>
            ))}
          </div>

          <div className="p-5 rounded-2xl bg-emerald-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-emerald-200">Tổng gói combo đã chọn:</span>
              <div className="text-2xl font-black text-amber-300">{money(checklistTotal)}</div>
            </div>
            <button
              onClick={addChecklistToCart}
              className="px-6 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm shadow-xl transition-all hover:scale-105 flex items-center justify-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" /> Thêm Trọn Bộ Vào Giỏ Hàng
            </button>
          </div>
        </section>

        {/* 5. GRADE SELECTOR & PRODUCTS */}
        <section className="rounded-3xl bg-white p-6 sm:p-8 shadow-xs border border-emerald-100 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-100 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                Tủ Đồ Dùng Học Tập
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                Văn Phòng Phẩm &amp; Dụng Cụ Học Sinh
              </h2>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {schoolGrades.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGrade(g.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                    selectedGrade === g.id
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  {g.title}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {(schoolProducts.length > 0 ? schoolProducts : products).map((p) => {
              const v = p.variants[0];
              return (
                <div
                  key={p.id}
                  className="rounded-3xl bg-slate-50 border border-slate-200/80 p-4 flex flex-col justify-between hover:bg-white hover:shadow-xl hover:-translate-y-1 transition-all group"
                >
                  <div className="relative aspect-square rounded-2xl bg-white p-4 flex flex-col items-center justify-center text-center border border-slate-100">
                    <PenTool className="w-10 h-10 text-emerald-600 group-hover:scale-110 transition-transform" />
                    {p.brand?.name && (
                      <span className="mt-3 px-2.5 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase">
                        {p.brand.name}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">
                      {p.category.name}
                    </span>
                    <h3 className="font-bold text-xs sm:text-sm text-slate-900 line-clamp-2 min-h-10">
                      {p.name}
                    </h3>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <span className="text-base font-black text-emerald-700">
                        {v ? money(v.price) : "Liên hệ"}
                      </span>
                      <button
                        onClick={() => addToCart(p)}
                        className="size-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-md transition-all hover:scale-105"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* CART DRAWER */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
          <aside className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between p-6">
            <div className="flex items-center justify-between border-b pb-4">
              <h3 className="font-black text-xl text-slate-900">Giỏ Hàng Tựu Trường</h3>
              <button onClick={() => setCartOpen(false)} className="p-2 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {cart.map((l) => (
                <div key={l.variantId} className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 line-clamp-1">{l.name}</h4>
                    <p className="text-xs font-black text-emerald-700 mt-0.5">{money(l.price)} x {l.quantity}</p>
                  </div>
                  <span className="font-mono font-bold text-xs">{money(l.price * l.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-4 space-y-3">
              <div className="flex justify-between font-black text-base">
                <span>Tổng tiền:</span>
                <span className="text-emerald-700">{money(subtotal)}</span>
              </div>
              <Link
                href="/shop"
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-center text-xs flex items-center justify-center gap-2 shadow-lg"
              >
                Chuyển Đến Trang Thanh Toán COD <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* FLOATING TOAST */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-950 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
