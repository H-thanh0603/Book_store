// Shop storefront — orchestrator only.
// The original 2,527-line monolith is split into focused components under
// src/app/shop/_components/. This file wires state (useStorefront) to sections.
//
// Heavy overlays (flipbook reader, checkout, gamification widgets) load through
// next/dynamic so their JS lives in separate chunks and is fetched only when
// actually needed — cutting the initial bundle for the public catalog.

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Feather } from "lucide-react";

import { useStorefront } from "./_components/useStorefront";
import {
  featuredCampaigns,
  departments,
  readingAtmospheres,
  authorSpotlight,
  comboBundles,
  blogArticles,
  vouchers,
  money,
} from "./_components/data";
import AnnouncementBar from "./_components/AnnouncementBar";
import ShopHeader from "./_components/ShopHeader";
import HeroCarousel from "./_components/HeroCarousel";
import DepartmentCards from "./_components/DepartmentCards";
import FlashSale from "./_components/FlashSale";
import ReadingLounge from "./_components/ReadingLounge";
import { AuthorSpotlightSection, ComboBundlesSection } from "./_components/AuthorAndCombos";
import BookOfMonth from "./_components/BookOfMonth";
import CatalogSection from "./_components/CatalogSection";
import { BlogSection, VoucherHub, NewsletterBox, ShopFooter } from "./_components/ShopSections";
import QuickViewModal from "./_components/QuickViewModal";
import {
  WishlistDrawer,
  CartDrawer,
  OrderSuccessModal,
  StoreSwitchModal,
} from "./_components/ShopOverlays";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

// ── Code-split overlays ──────────────────────────────────────────────────────
// ssr:false is safe: these are interaction-triggered modals; nothing above the
// fold depends on them, and skipping SSR avoids shipping their markup in the
// initial HTML payload.
const FlipbookReaderModal = dynamic(() => import("@/components/FlipbookReaderModal"), {
  ssr: false,
  loading: () => <OverlaySkeleton label="Đang mở trình đọc thử..." />,
});
const CheckoutModal = dynamic(() => import("./_components/CheckoutModal"), {
  ssr: false,
  loading: () => <OverlaySkeleton label="Đang mở trang thanh toán..." />,
});
const ShelfFinderModal = dynamic(() => import("@/components/ShelfFinderModal"), { ssr: false });
const AIConciergeModal = dynamic(() => import("@/components/AIConciergeModal"), { ssr: false });
const LuckyWheelModal = dynamic(() => import("@/components/LuckyWheelModal"), { ssr: false });

function OverlaySkeleton({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#1c1917]/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="px-6 py-5 rounded-2xl bg-white shadow-2xl text-xs font-serif font-bold text-slate-700 animate-pulse">
        {label}
      </div>
    </div>
  );
}

export default function ShopPage() {
  const s = useStorefront();
  const [copiedOrder, setCopiedOrder] = useState(false);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    "ctrl+k": () => {
      const input = s.searchContainerRef.current?.querySelector("input");
      input?.focus();
      s.setSearchFocused(true);
    },
    "ctrl+b": () => s.setCartOpen(!s.cartOpen),
    "ctrl+shift+w": () => s.setWishlistOpen(!s.wishlistOpen),
    "escape": () => {
      s.setCartOpen(false);
      s.setWishlistOpen(false);
      s.setCheckoutOpen(false);
      s.setQuickViewProduct(null);
      s.setShelfProduct(null);
      s.setFlipbookProduct(null);
      s.cancelStoreChange();
    },
  });

  function handleDepartment(deptId: string) {
    s.setActiveDepartment(deptId);
    if (deptId === "all") {
      s.setCategoryId("");
      return;
    }
    const matched = s.catalog?.categories.find((c) =>
      c.name.toLowerCase().includes(deptId.toLowerCase())
    );
    if (matched) s.setCategoryId(matched.id);
    document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <main className="min-h-screen paper-mesh text-slate-900 pb-24 font-sans selection:bg-[#8c2d19] selection:text-white">
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <AnnouncementBar
        wishlistCount={s.wishlist.length}
        storeName={s.activeStore?.name ?? "Đang chọn chi nhánh..."}
        onWishlist={() => s.setWishlistOpen(true)}
      />

      {/* 2. EDITORIAL HEADER */}
      <ShopHeader
        query={s.query}
        onQuery={s.setQuery}
        searchFocused={s.searchFocused}
        setSearchFocused={s.setSearchFocused}
        searchMatches={s.searchMatches}
        onSearchPick={(p) => {
          s.setQuickViewProduct(p);
          s.setSearchFocused(false);
        }}
        stores={s.catalog?.stores ?? []}
        storeId={s.storeId}
        onStoreChange={s.changeStore}
        onDepartment={handleDepartment}
        activeDepartment={s.activeDepartment}
        itemCount={s.itemCount}
        onCart={() => s.setCartOpen(true)}
        searchContainerRef={s.searchContainerRef}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-16">
        {/* 3. HERO */}
        <HeroCarousel
          campaigns={featuredCampaigns}
          currentSlide={s.currentSlide}
          onSlide={s.setCurrentSlide}
          onPrev={() =>
            s.setCurrentSlide(s.currentSlide === 0 ? featuredCampaigns.length - 1 : s.currentSlide - 1)
          }
          onNext={() => s.setCurrentSlide((s.currentSlide + 1) % featuredCampaigns.length)}
          paused={s.heroPaused}
          onPause={s.pauseHeroSlideShow}
          onResume={s.resumeHeroSlideShow}
        />

        {/* 4. DEPARTMENT DISCOVERY — compact chip row (merged from the old 6-card grid) */}
        <DepartmentCards
          departments={departments}
          onDepartment={handleDepartment}
          activeDepartment={s.activeDepartment}
        />

        {/* 5. FLASH SALE */}
        <FlashSale
          products={s.allProducts}
          countdown={s.countdown}
          activeStoreName={s.activeStore?.name ?? "tất cả chi nhánh"}
          money={money}
          onAddToCart={s.addToCart}
        />

        {/* 6. READING LOUNGE */}
        <ReadingLounge
          atmospheres={readingAtmospheres}
          activeMood={s.activeMood}
          onMood={s.setActiveMood}
          products={s.moodFilteredProducts}
          money={money}
          onQuickView={s.setQuickViewProduct}
        />

        {/* 7. AUTHOR SPOTLIGHT */}
        <AuthorSpotlightSection spotlight={authorSpotlight} />

        {/* 8. COMBO BUNDLES */}
        <ComboBundlesSection bundles={comboBundles} money={money} onAddCombo={s.addComboToCart} />

        {/* 9. BOOK OF THE MONTH */}
        {s.spotlightProduct && (
          <BookOfMonth
            product={s.spotlightProduct}
            money={money}
            onAddToCart={s.addToCart}
            onFlipbook={s.setFlipbookProduct}
          />
        )}

        {/* 10. FULL CATALOG */}
        <CatalogSection
          products={s.filteredProducts}
          allCount={s.allProducts.length}
          categories={s.catalog?.categories ?? []}
          query={s.query}
          categoryId={s.categoryId}
          activeDepartment={s.activeDepartment}
          activeStoreName={s.activeStore?.name ?? "chi nhánh"}
          wishlist={s.wishlist}
          loading={s.loading}
          error={s.error}
          hasActiveFilters={s.hasActiveFilters}
          sortBy={s.sortBy}
          onSortBy={s.setSortBy}
          viewMode={s.viewMode}
          onViewMode={s.setViewMode}
          priceRange={s.priceRange}
          onPriceRange={s.setPriceRange}
          onlyInStock={s.onlyInStock}
          onOnlyInStock={s.setOnlyInStock}
          onCategory={s.setCategoryId}
          onResetFilters={s.resetAllFilters}
          onQuickView={s.setQuickViewProduct}
          onShelfFinder={s.setShelfProduct}
          onFlipbook={s.setFlipbookProduct}
          onToggleFavorite={s.toggleFavorite}
          onAddToCart={s.addToCart}
        />

        {/* 11. BLOG */}
        <BlogSection articles={blogArticles} />

        {/* 12. VOUCHER HUB */}
        <VoucherHub vouchers={vouchers} onApply={s.applyVoucherCode} />

        {/* 13. NEWSLETTER */}
        <NewsletterBox />
      </div>

      {/* 15. FOOTER */}
      <ShopFooter activeStoreName={s.activeStore?.name ?? "Melio Central"} />

      {/* 16. QUICK VIEW MODAL */}
      {s.quickViewProduct && (
        <QuickViewModal
          product={s.quickViewProduct}
          storeName={s.activeStore?.name ?? "Melio Central"}
          money={money}
          onClose={() => s.setQuickViewProduct(null)}
          onShelfFinder={(p) => {
            s.setQuickViewProduct(null);
            s.setShelfProduct(p);
          }}
          onFlipbook={(p) => {
            s.setQuickViewProduct(null);
            s.setFlipbookProduct(p);
          }}
          onAddToCart={s.addToCart}
        />
      )}

      {/* 17. WISHLIST DRAWER */}
      <WishlistDrawer
        open={s.wishlistOpen}
        wishlist={s.wishlist}
        allProducts={s.allProducts}
        money={money}
        onClose={() => s.setWishlistOpen(false)}
        onAddToCart={s.addToCart}
        onToggleFavorite={s.toggleFavorite}
      />

      {/* 18. CART DRAWER */}
      <CartDrawer
        open={s.cartOpen}
        cart={s.cart}
        itemCount={s.itemCount}
        subtotal={s.subtotal}
        storeName={s.activeStore?.name ?? "Melio"}
        freeShippingThreshold={s.freeShippingThreshold}
        progressToFreeShipping={s.progressToFreeShipping}
        money={money}
        onClose={() => s.setCartOpen(false)}
        onChangeQuantity={s.changeQuantity}
        onRemoveLine={s.removeCartLine}
        onCheckout={() => {
          s.setCartOpen(false);
          s.setCheckoutOpen(true);
        }}
      />

      {/* 19. CHECKOUT MODAL — dynamically imported chunk */}
      {s.checkoutOpen && (
        <CheckoutModal
          cart={s.cart}
          discountTotal={s.discountTotal}
          wrappingFee={s.wrappingFee}
          grandTotal={s.grandTotal}
          quote={s.quote}
          quoteChecking={s.quoteChecking}
          fulfillment={s.fulfillment}
          onFulfillment={s.setFulfillment}
          paymentMethod={s.paymentMethod}
          onPaymentMethod={s.setPaymentMethod}
          giftWrapping={s.giftWrapping}
          onGiftWrapping={s.setGiftWrapping}
          giftMessage={s.giftMessage}
          onGiftMessage={s.setGiftMessage}
          customer={s.customer}
          onCustomer={s.setCustomer}
          couponInput={s.couponInput}
          onCouponInput={s.setCouponInput}
          storeName={s.activeStore?.name ?? "Melio"}
          money={money}
          submitting={s.submitting}
          error={s.error}
          onClose={() => s.setCheckoutOpen(false)}
          onSubmit={s.checkout}
        />
      )}

      {/* 19b. STORE-SWITCH CONFIRM — replaces native window.confirm */}
      {s.pendingStore && (
        <StoreSwitchModal
          nextStoreName={s.catalog?.stores.find((st) => st.id === s.pendingStore)?.name ?? "chi nhánh mới"}
          itemCount={s.itemCount}
          onCancel={s.cancelStoreChange}
          onConfirm={s.confirmStoreChange}
        />
      )}

      {/* 20. ORDER SUCCESS */}
      {s.success && (
        <OrderSuccessModal
          success={s.success}
          storeName={s.activeStore?.name ?? "Melio"}
          money={money}
          copiedOrder={copiedOrder}
          onCopy={() => {
            navigator.clipboard.writeText(s.success!.number);
            setCopiedOrder(true);
            setTimeout(() => setCopiedOrder(false), 2000);
          }}
          onClose={() => s.setSuccess(null)}
        />
      )}

      {/* 21. SHELF FINDER — dynamic */}
      {s.shelfProduct && (
        <ShelfFinderModal
          productName={s.shelfProduct.name}
          categoryName={s.shelfProduct.category.name}
          storeName={s.activeStore?.name ?? "Melio Central"}
          onClose={() => s.setShelfProduct(null)}
        />
      )}

      {/* 22. FLIPBOOK READER — dynamic chunk */}
      {s.flipbookProduct && (
        <FlipbookReaderModal
          productName={s.flipbookProduct.name}
          authorName={s.flipbookProduct.author?.name ?? s.flipbookProduct.publisher?.name}
          price={s.flipbookProduct.variants[0]?.price ?? 0}
          onClose={() => s.setFlipbookProduct(null)}
          onAddToCart={() => s.addToCart(s.flipbookProduct!)}
        />
      )}

      {/* 23. AI CONCIERGE — dynamic */}
      <AIConciergeModal
        onAddToCart={(item) => {
          // ID first (exact, straight from search results); name substring
          // only as fallback when the model dropped productId. Never fall
          // back to a random product — unmatched is surfaced honestly.
          const matched = s.allProducts.find((p) => p.id === item.productId)
            ?? s.allProducts.find((p) =>
              p.name.toLowerCase().includes(item.name.toLowerCase())
            );
          if (matched) {
            s.addToCart(matched);
          } else {
            s.showToast(`Không tìm thấy "${item.name}" trong kho — thử gợi ý khác nhé`);
          }
        }}
      />

      {/* 24. LUCKY WHEEL — dynamic */}
      <LuckyWheelModal onRewardWon={(prize) => s.showToast(`🎉 Chúc mừng bạn đã quay trúng: ${prize}!`)} />

      {/* 25. FLOATING TOAST */}
      {s.toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-white text-slate-900 px-5 py-3.5 rounded-2xl shadow-2xl border border-[#ede5d8] text-xs font-bold flex items-center gap-2.5 animate-in slide-in-from-bottom-5 duration-200">
          <Feather className="w-4 h-4 text-[#8c2d19]" />
          <span>{s.toast.message}</span>
        </div>
      )}
    </main>
  );
}
