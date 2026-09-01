// Section 2: REFINED EDITORIAL HEADER (logo, mega-search, hubs, store switcher, cart)
// Mirrors the original shop/page.tsx header + department sub-navigation.
import Link from "next/link";
import { BookOpen, BookMarked, Gift, Search, Store, ShoppingBag, Trophy, User, X } from "lucide-react";
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
  return (
    <header className="sticky top-0 z-40 bg-[#fbf9f5]/95 backdrop-blur-xl border-b border-[#ede5d8] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3 sm:gap-6">
        {/* Heritage Logo */}
        <Link href="/shop" className="flex items-center gap-2.5 shrink-0 group" aria-label="Melio Bookstore">
          <div className="size-11 rounded-2xl bg-[#1c1917] text-[#ffd56a] flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="font-serif font-black text-2xl text-[#1c1917] tracking-tight leading-none">Melio</span>
              <span className="text-[10px] font-serif uppercase tracking-[0.2em] bg-[#8c2d19] text-white px-1.5 py-0.5 rounded font-bold">
                Flagship
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-serif italic tracking-wide">Hiệu Sách &amp; Không Gian Sống</p>
          </div>
        </Link>

        {/* Mega Search Bar with Smart Autocomplete Dropdown */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-xl">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Tìm kiếm tác phẩm, bút Thiên Long, đồ chơi LEGO, ISBN..."
              className="w-full bg-white border border-[#ede5d8] rounded-2xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19] transition-all shadow-2xs"
            />
            {query && (
              <button
                onClick={() => onQuery("")}
                aria-label="Xóa từ khóa"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Smart Autocomplete Dropdown */}
          {searchFocused && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-[#ede5d8] p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
              {query.trim() ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-serif font-bold text-slate-500 border-b border-[#ede5d8] pb-2">
                    <span>Sản phẩm gợi ý cho &quot;{query}&quot;</span>
                    <span>{searchMatches.length} kết quả</span>
                  </div>
                  {searchMatches.length > 0 ? (
                    <div className="space-y-2">
                      {searchMatches.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            onSearchPick(p);
                            setSearchFocused(false);
                          }}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-[#faf6ef] transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-[#1c1917] text-white flex items-center justify-center text-[8px] font-serif p-1 text-center font-bold">
                              {p.category.name.slice(0, 4)}
                            </div>
                            <div>
                              <h5 className="font-serif font-bold text-xs text-slate-900 group-hover:text-[#8c2d19] line-clamp-1">
                                {p.name}
                              </h5>
                              <span className="text-[10px] text-slate-400 font-serif">
                                {p.author?.name ?? p.brand?.name ?? p.category.name}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <b className="font-serif text-xs font-black text-[#1c1917] block">
                              {p.variants[0] ? `${p.variants[0].price.toLocaleString("vi-VN")} ₫` : "Liên hệ"}
                            </b>
                            <span className={`text-[9px] font-bold ${(p.variants[0]?.available ?? 0) > 0 ? "text-[#14532d]" : "text-red-600"}`}>
                              {(p.variants[0]?.available ?? 0) > 0 ? `Còn ${p.variants[0].available}` : "Hết hàng"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-xs font-serif text-slate-400">
                      Không tìm thấy sản phẩm khớp với từ khóa
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="text-[11px] font-serif font-bold text-slate-400 uppercase tracking-wider block">
                    🔥 Từ khóa tìm kiếm thịnh hành:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {hotSearchKeywords.map((kw, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          onQuery(kw);
                          setSearchFocused(false);
                        }}
                        className="px-3 py-1.5 rounded-full bg-[#faf7f2] hover:bg-[#ede5d8] text-xs font-serif text-slate-700 transition-colors border border-[#ede5d8]"
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

        {/* Quick Page Hubs */}
        <nav className="hidden lg:flex items-center gap-2 text-xs font-serif font-bold text-slate-700">
          <Link href="/bestsellers" className="px-3 py-1.5 rounded-xl hover:bg-[#faf6ef] hover:text-[#8c2d19] transition-colors flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5 text-amber-600" /> Bestsellers
          </Link>
          <Link href="/gift-finder" className="px-3 py-1.5 rounded-xl hover:bg-[#faf6ef] hover:text-[#8c2d19] transition-colors flex items-center gap-1">
            <Gift className="w-3.5 h-3.5 text-rose-600" /> Quà Tặng
          </Link>
          <Link href="/reading-challenge" className="px-3 py-1.5 rounded-xl hover:bg-[#faf6ef] hover:text-[#8c2d19] transition-colors flex items-center gap-1">
            <BookMarked className="w-3.5 h-3.5 text-emerald-600" /> Thử Thách
          </Link>
        </nav>

        {/* Store Switcher */}
        <div className="hidden md:flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-2xl border border-[#ede5d8] text-xs">
          <Store className="w-3.5 h-3.5 text-[#8c2d19] shrink-0" />
          <select
            value={storeId}
            onChange={(e) => onStoreChange(e.target.value)}
            aria-label="Chọn chi nhánh"
            className="bg-transparent text-slate-800 font-serif font-semibold outline-none cursor-pointer text-xs"
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
          className="relative flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-serif font-bold text-xs shadow-md transition-all hover:scale-105 active:scale-95 shrink-0"
        >
          <ShoppingBag className="w-4 h-4" />
          <span className="hidden sm:inline">Giỏ hàng</span>
          {itemCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-[#8c2d19] text-white font-mono font-bold text-[10px]">
              {itemCount}
            </span>
          )}
        </button>

        {/* Account Link */}
        <Link
          href="/shop/account"
          aria-label="Tài khoản khách hàng"
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl border border-[#ede5d8] bg-white hover:bg-[#faf7f2] text-slate-700 font-serif font-bold text-xs transition-colors shrink-0"
        >
          <User className="w-4 h-4" />
          <span className="hidden sm:inline">Tài khoản</span>
        </Link>
      </div>

      {/* Secondary Department Sub-Navigation */}
      <div className="border-t border-[#ede5d8] bg-white overflow-x-auto py-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 text-xs font-serif font-bold text-slate-700 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {departments.map((dept) => {
              const Icon: ComponentType<{ className?: string }> = dept.icon;
              const isSelected = activeDepartment === dept.id;
              return (
                <button
                  key={dept.id}
                  onClick={() => onDepartment(dept.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                    isSelected ? "bg-[#1c1917] text-white shadow-xs" : "hover:bg-[#faf7f2] hover:text-[#8c2d19]"
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
            <Link href="/back-to-school" className="flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors text-[11px]">
              🎒 Mùa Tựu Trường
            </Link>
            <Link href="/toys" className="flex items-center gap-1 px-3 py-1 rounded-full bg-purple-50 text-purple-800 hover:bg-purple-100 transition-colors text-[11px]">
              🧸 Đồ Chơi LEGO
            </Link>
            <Link href="/deals" className="flex items-center gap-1 px-3 py-1 rounded-full bg-rose-50 text-[#c83f49] hover:bg-rose-100 transition-colors text-[11px]">
              ⚡ Săn Giờ Vàng
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
