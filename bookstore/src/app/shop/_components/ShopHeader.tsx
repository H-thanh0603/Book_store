// Section 2: REFINED EDITORIAL HEADER (logo, mega-search, hubs, store switcher, cart)
// Mirrors the original shop/page.tsx header + department sub-navigation.
import Link from "next/link";
import { useState } from "react";
import { BookOpen, BookMarked, Gift, Menu, Search, Store, ShoppingBag, Trophy, User, X } from "lucide-react";
import type { ComponentType } from "react";
import type { Product } from "./types";
import { departments, hotSearchKeywords } from "./data";

export default function ShopHeader({
  query,
  onQuery,
  searchFocused,
  setSearchFocused,
  searchMatches,
  onSearchPick,
  stores,
  storeId,
  onStoreChange,
  onDepartment,
  activeDepartment,
  itemCount,
  onCart,
  searchContainerRef,
}: {
  query: string;
  onQuery: (v: string) => void;
  searchFocused: boolean;
  setSearchFocused: (v: boolean) => void;
  searchMatches: Product[];
  onSearchPick: (p: Product) => void;
  stores: { id: string; name: string; code: string }[];
  storeId: string;
  onStoreChange: (v: string) => void;
  onDepartment: (id: string) => void;
  activeDepartment: string;
  itemCount: number;
  onCart: () => void;
  searchContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-[#ede5d8] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3 sm:gap-6">
        {/* Heritage Brand Logo */}
        <Link href="/shop" className="flex items-center gap-2.5 shrink-0 group" aria-label="Melio Bookstore">
          <div className="size-11 rounded-2xl bg-gradient-to-tr from-[#8c2d19] via-[#a63a1f] to-[#d97706] text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-serif font-black text-2xl text-slate-900 tracking-tight leading-none group-hover:text-[#8c2d19] transition-colors">
                Melio
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider bg-[#1c1917] text-[#ffd56a] px-2 py-0.5 rounded-full">
                Flagship
              </span>
            </div>
            <p className="text-[10px] text-[#574431] font-semibold tracking-wide flex items-center gap-1">
              <span>Hiệu Sách &amp; Không Gian Sống</span>
            </p>
          </div>
        </Link>

        {/* Mega Search Bar with Smart Autocomplete Dropdown */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-xl">
          <div className="relative">
            <Search className="w-4 h-4 text-rose-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Tìm kiếm tác phẩm, bút Thiên Long, đồ chơi LEGO, tác giả..."
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 rounded-2xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-2xs"
            />
            {query && (
              <button
                onClick={() => onQuery("")}
                aria-label="Xóa từ khóa"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Smart Autocomplete Dropdown */}
          {searchFocused && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-[#ede5d8] p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
              {query.trim() ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 border-b border-slate-100 pb-2">
                    <span>Gợi ý cho &quot;{query}&quot;</span>
                    <span className="text-[#8c2d19]">{searchMatches.length} kết quả</span>
                  </div>
                  {searchMatches.length > 0 ? (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {searchMatches.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            onSearchPick(p);
                            setSearchFocused(false);
                          }}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-[#faf4ea] transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-xl bg-gradient-to-tr from-[#8c2d19] to-[#d97706] text-white flex items-center justify-center text-[9px] font-bold p-1 text-center shadow-xs">
                              {p.category.name.slice(0, 4)}
                            </div>
                            <div>
                              <h5 className="font-bold text-xs text-slate-900 group-hover:text-[#8c2d19] line-clamp-1">
                                {p.name}
                              </h5>
                              <span className="text-[11px] text-slate-500">
                                {p.author?.name ?? p.brand?.name ?? p.category.name}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <b className="text-xs font-black text-slate-900 block group-hover:text-[#8c2d19]">
                              {p.variants[0] ? `${p.variants[0].price.toLocaleString("vi-VN")} ₫` : "Liên hệ"}
                            </b>
                            <span className={`text-[11px] font-bold ${(p.variants[0]?.available ?? 0) > 0 ? "text-[#14532d]" : "text-[#8c2d19]"}`}>
                              {(p.variants[0]?.available ?? 0) > 0 ? `Còn ${p.variants[0].available}` : "Hết hàng"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-xs text-slate-400">
                      Không tìm thấy sản phẩm khớp với từ khóa
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="text-[11px] font-bold text-[#8c2d19] uppercase tracking-wider block">
                    Tìm kiếm phổ biến hôm nay:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {hotSearchKeywords.map((kw, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          onQuery(kw);
                          setSearchFocused(false);
                        }}
                        className="px-3 py-1 rounded-full bg-[#faf4ea] hover:bg-[#ede5d8] hover:text-[#8c2d19] text-xs text-slate-700 transition-colors border border-[#ede5d8] cursor-pointer"
                      >
                        {kw}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Hub Links */}
        <nav className="hidden lg:flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <Link href="/bestsellers" className="px-3 py-1.5 rounded-xl hover:bg-[#faf4ea] hover:text-[#8c2d19] transition-colors flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5 text-[#d97706]" /> Bestsellers
          </Link>
          <Link href="/deals" className="px-3 py-1.5 rounded-xl hover:bg-[#faf4ea] hover:text-[#8c2d19] transition-colors flex items-center gap-1">
            <span className="text-[#8c2d19] font-black">⚡</span> Giờ Vàng
          </Link>
          <Link href="/gift-finder" className="px-3 py-1.5 rounded-xl hover:bg-[#faf4ea] hover:text-[#8c2d19] transition-colors flex items-center gap-1">
            <Gift className="w-3.5 h-3.5 text-[#8c2d19]" /> Quà Tặng
          </Link>
          <Link href="/reading-challenge" className="px-3 py-1.5 rounded-xl hover:bg-[#faf4ea] hover:text-[#8c2d19] transition-colors flex items-center gap-1">
            <BookMarked className="w-3.5 h-3.5 text-[#14532d]" /> Thử Thách
          </Link>
        </nav>

        {/* Store Switcher */}
        <div className="hidden md:flex items-center gap-1.5 bg-[#faf4ea] hover:bg-[#ede5d8] px-3 py-1.5 rounded-2xl border border-[#ede5d8] text-xs transition-colors">
          <Store className="w-3.5 h-3.5 text-[#8c2d19] shrink-0" />
          <select
            value={storeId}
            onChange={(e) => onStoreChange(e.target.value)}
            aria-label="Chọn chi nhánh"
            className="bg-transparent text-slate-800 font-semibold outline-none cursor-pointer text-xs"
          >
            {stores.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name} ({st.code})
              </option>
            ))}
          </select>
        </div>

        {/* Cart Button */}
        <button
          onClick={onCart}
          className="relative flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-bold text-xs shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
        >
          <ShoppingBag className="w-4 h-4" />
          <span className="hidden sm:inline">Giỏ hàng</span>
          {itemCount > 0 && (
            <span className="inline-flex items-center justify-center size-5 rounded-full bg-[#ffd56a] text-[#6b2113] font-black text-[11px]">
              {itemCount}
            </span>
          )}
        </button>

        {/* Account Link */}
        <Link
          href="/shop/account"
          aria-label="Tài khoản khách hàng"
          className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 rounded-2xl border border-[#ede5d8] bg-[#faf4ea] hover:bg-[#ede5d8] text-slate-700 font-bold text-xs transition-colors shrink-0"
        >
          <User className="w-4 h-4 text-slate-600" />
          <span className="hidden lg:inline">Tài khoản</span>
        </Link>

        {/* Mobile nav toggle — quick hubs + store switcher live here on phones */}
        <button
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-quick-nav"
          aria-label="Mở mục lục nhanh"
          className="lg:hidden flex items-center justify-center size-10 rounded-2xl border border-[#ede5d8] bg-[#faf4ea] text-slate-700 shrink-0 cursor-pointer"
        >
          {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile quick nav — the hub links + store picker unreachable on phones before */}
      {mobileNavOpen && (
        <nav id="mobile-quick-nav" className="lg:hidden border-t border-[#ede5d8] bg-white px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs font-bold">
            <Link href="/bestsellers" onClick={() => setMobileNavOpen(false)} className="px-3 py-2.5 rounded-xl bg-[#faf4ea] text-slate-700 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-[#d97706]" /> Bestsellers
            </Link>
            <Link href="/deals" onClick={() => setMobileNavOpen(false)} className="px-3 py-2.5 rounded-xl bg-[#faf4ea] text-slate-700 flex items-center gap-1.5">
              <span className="text-[#8c2d19] font-black">⚡</span> Giờ Vàng
            </Link>
            <Link href="/gift-finder" onClick={() => setMobileNavOpen(false)} className="px-3 py-2.5 rounded-xl bg-[#faf4ea] text-slate-700 flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-[#8c2d19]" /> Quà Tặng
            </Link>
            <Link href="/reading-challenge" onClick={() => setMobileNavOpen(false)} className="px-3 py-2.5 rounded-xl bg-[#faf4ea] text-slate-700 flex items-center gap-1.5">
              <BookMarked className="w-4 h-4 text-[#14532d]" /> Thử Thách
            </Link>
          </div>
          <div className="flex items-center gap-1.5 bg-[#faf4ea] px-3 py-2 rounded-2xl border border-[#ede5d8] text-xs">
            <Store className="w-3.5 h-3.5 text-[#8c2d19] shrink-0" />
            <select
              value={storeId}
              onChange={(e) => onStoreChange(e.target.value)}
              aria-label="Chọn chi nhánh"
              className="w-full bg-transparent text-slate-800 font-semibold outline-none cursor-pointer text-xs"
            >
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.code})
                </option>
              ))}
            </select>
          </div>
        </nav>
      )}

      {/* Secondary Department Sub-Navigation */}
      <div className="border-t border-[#ede5d8] bg-[#fbf9f5]/95 backdrop-blur-md overflow-x-auto py-2.5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 text-xs font-bold text-slate-700 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {departments.map((dept) => {
              const Icon: ComponentType<{ className?: string }> = dept.icon;
              const isSelected = activeDepartment === dept.id;
              return (
                <button
                  key={dept.id}
                  onClick={() => onDepartment(dept.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#1c1917] text-[#ffd56a] shadow-md"
                      : "hover:bg-[#ede5d8] hover:text-[#8c2d19]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{dept.name}</span>
                </button>
              );
            })}
          </div>

          {/* Dedicated Landing Page Badges */}
          <div className="hidden xl:flex items-center gap-2 border-l border-[#ede5d8] pl-3">
            <Link href="/back-to-school" className="flex items-center gap-1 px-3 py-1 rounded-full bg-[#dcfce7] text-[#14532d] hover:bg-[#bbf7d0] border border-[#86efac]/50 transition-colors text-[11px] font-bold">
              🎒 Mùa Tựu Trường
            </Link>
            <Link href="/toys" className="flex items-center gap-1 px-3 py-1 rounded-full bg-[#faf4ea] text-[#8c2d19] hover:bg-[#ede5d8] border border-[#e8dac5] transition-colors text-[11px] font-bold">
              🧸 Đồ Chơi LEGO
            </Link>
            <Link href="/deals" className="flex items-center gap-1 px-3 py-1 rounded-full bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a] border border-[#fcd34d]/50 transition-colors text-[11px] font-bold">
              ⚡ Săn Giờ Vàng
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

