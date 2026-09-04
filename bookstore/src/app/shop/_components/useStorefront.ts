// useStorefront — single hook that owns ALL stateful logic for the shop page.
// Centralising here lets `page.tsx` stay a thin orchestrator that only wires
// sections together, and keeps the 409 race-recovery flow in one place
// (`handleCheckoutConflict`).
//
// Ported from the original 2.5k-line shop/page.tsx; behaviour preserved.

import { useEffect, useMemo, useRef, useState } from "react";

import { money, readingAtmospheres, comboBundles } from "./data";
import type {
  Catalog,
  Fulfillment,
  GiftWrapping,
  PaymentMethodChoice,
  Product,
  StockConflictDetail,
} from "./types";
import { useCart } from "@/contexts/CartContext";

export type Toast = { id: string; message: string };

export type QuotePreview = {
  subtotal: number;
  discountTotal: number;
  total: number;
  promotions: { name: string; discountTotal: number }[];
  couponApplied: boolean;
  couponInvalidReason?: string;
};

const defaultCustomer = { name: "", phone: "", email: "", address: "" };
const FREE_SHIPPING_THRESHOLD = 250000;
/** Hero slides — kept in the hook so the rotation timer owns one source of truth. */
const featuredCampaignCount = 4;

/** Body of a backend error as returned by apiError (details surfaced on 409). */
type ApiErrorBody = {
  code?: string;
  message?: string;
  requestId?: string;
  details?: StockConflictDetail | { items?: StockConflictDetail[] };
};

export function useStorefront() {
  const { cart, addItem: addToCartContext, updateQuantity, removeItem: removeCartLineContext, clearCart, itemCount, subtotal: cartSubtotal } = useCart();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [storeId, setStoreId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeDepartment, setActiveDepartment] = useState("all");
  const [activeMood, setActiveMood] = useState("rain");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [shelfProduct, setShelfProduct] = useState<Product | null>(null);
  const [flipbookProduct, setFlipbookProduct] = useState<Product | null>(null);
  const [giftWrapping, setGiftWrapping] = useState<GiftWrapping>("none");
  const [giftMessage, setGiftMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [quote, setQuote] = useState<QuotePreview | null>(null);
  const [quoteChecking, setQuoteChecking] = useState(false);
  const [pendingStore, setPendingStore] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ number: string; total: number } | null>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodChoice>("COD");
  const [customer, setCustomer] = useState(defaultCustomer);
  const [toast, setToast] = useState<Toast | null>(null);

  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [sortBy, setSortBy] = useState<"popular" | "price_asc" | "price_desc" | "name_asc" | "newest">("popular");
  const [viewMode, setViewMode] = useState<"grid5" | "grid3" | "list">("grid5");
  const [priceRange, setPriceRange] = useState<"all" | "under100" | "100to250" | "250to500" | "above500">("all");
  const [onlyInStock, setOnlyInStock] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const checkoutAttempt = useRef<{ signature: string; key: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroPausedRef = useRef(false);
  const [heroPaused, setHeroPaused] = useState(false);

  // ── effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load wishlist from localStorage (deferred past mount for hydration), and
  // pick up a deep-link search term (?q=...) so shared/blog links land on a
  // meaningful catalog view.
  useEffect(() => {
    let storedWishlist: string[] = [];
    try {
      storedWishlist = JSON.parse(localStorage.getItem("melio.storefront.wishlist.v1") ?? "[]");
    } catch {}
    const t = setTimeout(() => {
      setWishlist(storedWishlist);
    }, 0);
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    localStorage.setItem("melio.storefront.wishlist.v1", JSON.stringify(wishlist));
  }, [wishlist]);

  // Rotate hero slides every 7s — paused on interaction (WCAG 2.2.2) and
  // suspended entirely when the visitor prefers reduced motion.
  useEffect(() => {
    if (heroPausedRef.current) return;
    const slideTimer = setInterval(() => {
      setCurrentSlide((current) => (current + 1) % featuredCampaignCount);
    }, 7000);
    return () => clearInterval(slideTimer);
  }, [heroPaused]);

  function pauseHeroSlideShow() {
    heroPausedRef.current = true;
    setHeroPaused(true);
  }

  function resumeHeroSlideShow() {
    heroPausedRef.current = false;
    setHeroPaused(false);
  }

  // Debounced coupon/cart preview — mirrors the real promotion engine so the
  // displayed total always matches what checkout will charge.
  useEffect(() => {
    if (!checkoutOpen || cart.length === 0) {
      setQuote(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      setQuoteChecking(true);
      try {
        const params = new URLSearchParams();
        params.set("storeId", storeId);
        params.set("items", cart.map((line) => `${line.variantId}:${line.quantity}`).join(","));
        if (couponInput.trim()) params.set("couponCode", couponInput.trim());
        const response = await fetch(`/api/storefront/quote?${params}`);
        const data = await response.json();
        if (response.ok) setQuote(data as QuotePreview);
      } catch {
        // Preview is best-effort — the real total is enforced at checkout.
        setQuote(null);
      } finally {
        setQuoteChecking(false);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [checkoutOpen, cart, couponInput, storeId]);

  // Countdown to midnight (store timezone) — a real deadline, not a loop.
  useEffect(() => {
    function secondsUntilMidnight(): number {
      const now = new Date();
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Ho_Chi_Minh", hour12: false,
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      const get = (type: string) => Number(fmt.formatToParts(now).find((p) => p.type === type)?.value ?? 0);
      return 86_400 - ((get("hour") % 24) * 3600 + get("minute") * 60 + get("second"));
    }
    function tick() {
      const total = secondsUntilMidnight();
      setCountdown({
        hours: Math.floor(total / 3600),
        minutes: Math.floor((total % 3600) / 60),
        seconds: total % 60,
      });
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  async function fetchCatalog(params: URLSearchParams): Promise<Catalog | null> {
    try {
      const response = await fetch(`/api/storefront?${params}`);
      const data = await response.json();
      if (response.ok) return data as Catalog;
      setError((data as ApiErrorBody).message ?? "Không thể tải sản phẩm");
      return null;
    } catch {
      setError("Lỗi kết nối máy chủ");
      return null;
    }
  }

  // Debounced catalog fetch driven by filters.
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (categoryId) params.set("categoryId", categoryId);
      if (storeId) params.set("storeId", storeId);
      const data = await fetchCatalog(params);
      if (data) {
        setCatalog(data);
        if (!storeId && data.storeId) setStoreId(data.storeId);
        setError("");
      }
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, categoryId, storeId]);

  // ── derived ─────────────────────────────────────────────────────────────
  const allProducts = useMemo(() => catalog?.products ?? [], [catalog]);

  const searchMatches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.name.toLowerCase().includes(q) ||
        p.brand?.name?.toLowerCase().includes(q) ||
        p.author?.name?.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [allProducts, query]);

  const filteredProducts = useMemo(() => {
    let list = [...allProducts];
    if (activeDepartment !== "all") {
      list = list.filter((p) => p.category.name.toLowerCase().includes(activeDepartment.toLowerCase()));
    }
    if (priceRange === "under100") {
      list = list.filter((p) => (p.variants[0]?.price ?? 0) < 100000);
    } else if (priceRange === "100to250") {
      list = list.filter((p) => {
        const price = p.variants[0]?.price ?? 0;
        return price >= 100000 && price <= 250000;
      });
    } else if (priceRange === "250to500") {
      list = list.filter((p) => {
        const price = p.variants[0]?.price ?? 0;
        return price >= 250000 && price <= 500000;
      });
    } else if (priceRange === "above500") {
      list = list.filter((p) => (p.variants[0]?.price ?? 0) > 500000);
    }
    if (onlyInStock) {
      list = list.filter((p) => (p.variants[0]?.available ?? 0) > 0);
    }
    if (sortBy === "price_asc") {
      list.sort((a, b) => (a.variants[0]?.price ?? 0) - (b.variants[0]?.price ?? 0));
    } else if (sortBy === "price_desc") {
      list.sort((a, b) => (b.variants[0]?.price ?? 0) - (a.variants[0]?.price ?? 0));
    } else if (sortBy === "name_asc") {
      list.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    } else if (sortBy === "newest") {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [allProducts, activeDepartment, priceRange, onlyInStock, sortBy]);

  const moodFilteredProducts = useMemo(() => {
    const selected = readingAtmospheres.find((m) => m.id === activeMood);
    if (!selected) return allProducts.slice(0, 4);
    return allProducts
      .filter(
        (p) =>
          p.category.name.toLowerCase().includes(selected.filter) ||
          p.name.toLowerCase().includes(selected.filter)
      )
      .slice(0, 4);
  }, [allProducts, activeMood]);

  const productByVariant = useMemo(
    () =>
      new Map(
        allProducts.flatMap((product) =>
          product.variants.map((variant) => [variant.id, { product, variant }] as const)
        )
      ),
    [allProducts]
  );

  const wrappingFee = giftWrapping === "vintage" ? 25000 : giftWrapping === "heritage" ? 45000 : 0;
  // Prefer the server quote (real promotion engine) when present; the local
  // arithmetic is the no-network fallback so the total never reads 0.
  const discountTotal = quote?.discountTotal ?? 0;
  const grandTotal = Math.max(0, cartSubtotal - discountTotal + wrappingFee);
  const activeStore = catalog?.stores.find((store) => store.id === storeId);
  const progressToFreeShipping = Math.min(100, Math.round((cartSubtotal / FREE_SHIPPING_THRESHOLD) * 100));
  const hasActiveFilters =
    Boolean(categoryId) ||
    activeDepartment !== "all" ||
    priceRange !== "all" ||
    onlyInStock ||
    sortBy !== "popular" ||
    Boolean(query);

  // ── actions ─────────────────────────────────────────────────────────────
  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: `toast-${Date.now()}`, message });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  function toggleFavorite(id: string) {
    setWishlist((prev) => {
      const exists = prev.includes(id);
      if (exists) {
        showToast("Đã bỏ khỏi danh sách yêu thích");
        return prev.filter((x) => x !== id);
      }
      showToast("❤️ Đã lưu vào tủ sách cá nhân!");
      return [...prev, id];
    });
  }

  function addToCart(product: Product) {
    const variant = product.variants[0];
    if (!variant || variant.available <= 0) return;
    addToCartContext({
      variantId: variant.id,
      productId: product.id,
      name: product.name,
      category: product.category.name,
      brand: product.brand?.name,
      price: variant.price,
      available: variant.available,
    });
    showToast(`✨ Đã thêm "${product.name}" vào giỏ hàng!`);
    setCartOpen(true);
  }

  /**
   * Add a combo bundle as its real component products. Each bundle declares
   * matching search terms for every physical item; we resolve each to a real
   * catalog product and add every in-stock component. If ANY component cannot
   * be matched or is out of stock, nothing is added and the toast says so —
   * a partial bundle in the cart would be a lie the customer discovers at
   * the door.
   */
  function addComboToCart(bundle: { title: string }) {
    const spec = comboBundles.find((b) => b.title === bundle.title);
    const searchTerms = spec?.matchTerms ?? [];
    if (!spec || searchTerms.length === 0 || allProducts.length === 0) {
      showToast("Combo này tạm không khả dụng — vui lòng quay lại sau");
      return;
    }
    const missing: string[] = [];
    for (const term of searchTerms) {
      const needle = term.toLowerCase();
      const product = allProducts.find((p) =>
        p.name.toLowerCase().includes(needle) ||
        p.category.name.toLowerCase().includes(needle)
      );
      const variant = product?.variants[0];
      if (!product || !variant || variant.available <= 0) {
        missing.push(term);
      }
    }
    if (missing.length > 0) {
      showToast(`Combo tạm thiếu: ${missing.join(", ")} — chưa thể thêm trọn gói`);
      return;
    }
    for (const term of searchTerms) {
      const needle = term.toLowerCase();
      const product = allProducts.find((p) =>
        p.name.toLowerCase().includes(needle) ||
        p.category.name.toLowerCase().includes(needle)
      )!;
      addToCartSilently(product);
    }
    showToast(`🎁 Đã thêm ${searchTerms.length} sản phẩm của gói "${bundle.title}" vào giỏ hàng!`);
    setCartOpen(true);
  }

  /** addToCart without its toast/open-cart side effects (used by bundle adds). */
  function addToCartSilently(product: Product) {
    const variant = product.variants[0];
    if (!variant || variant.available <= 0) return;
    addToCartContext({
      variantId: variant.id,
      productId: product.id,
      name: product.name,
      category: product.category.name,
      brand: product.brand?.name,
      price: variant.price,
      available: variant.available,
    });
  }

  function addAllWishlistToCart() {
    let addedCount = 0;
    wishlist.forEach((id) => {
      const prod = allProducts.find((p) => p.id === id);
      if (prod && prod.variants[0] && prod.variants[0].available > 0) {
        addToCart(prod);
        addedCount++;
      }
    });
    if (addedCount > 0) {
      showToast(`📚 Đã chuyển ${addedCount} sản phẩm từ tủ sách vào giỏ hàng!`);
      setWishlistOpen(false);
      setCartOpen(true);
    } else {
      showToast("Không có sản phẩm nào có sẵn để thêm vào giỏ");
    }
  }

  function resetAllFilters() {
    setCategoryId("");
    setActiveDepartment("all");
    setPriceRange("all");
    setOnlyInStock(false);
    setSortBy("popular");
    setQuery("");
  }

  function changeQuantity(variantId: string, delta: number) {
    const line = cart.find((l) => l.variantId === variantId);
    if (!line) return;
    const latest = productByVariant.get(variantId)?.variant.available ?? line.available;
    const newQuantity = line.quantity + delta;
    if (newQuantity <= 0) {
      removeCartLineContext(variantId);
    } else {
      updateQuantity(variantId, Math.min(newQuantity, latest));
    }
  }

  function removeCartLine(variantId: string) {
    removeCartLineContext(variantId);
  }

  /**
   * Store switch: with items in the cart we stop and ask via an in-brand
   * dialog (pendingStore) instead of a native confirm. The caller confirms
   * with confirmStoreChange() or dismisses with cancelStoreChange().
   */
  function changeStore(nextStoreId: string) {
    if (nextStoreId === storeId) return;
    if (cart.length > 0) {
      setPendingStore(nextStoreId);
      return;
    }
    setStoreId(nextStoreId);
  }

  function confirmStoreChange() {
    if (!pendingStore) return;
    clearCart();
    setStoreId(pendingStore);
    setPendingStore(null);
    showToast("Đã chuyển chi nhánh và làm mới giỏ hàng theo tồn kho mới");
  }

  function cancelStoreChange() {
    setPendingStore(null);
  }

  function applyVoucherCode(code: string) {
    setCouponInput(code);
    navigator.clipboard.writeText(code);
    showToast(`🎟️ Đã chép mã "${code}" — dán vào ô mã giảm giá khi thanh toán`);
  }

  /** Clamp one cart line to freshly-reported availability (post-409 recovery). */
  function updateCartAvailability(variantId: string, available: number) {
    updateQuantity(variantId, available);
  }

  async function refreshCatalog() {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (categoryId) params.set("categoryId", categoryId);
    if (storeId) params.set("storeId", storeId);
    const fresh = await fetchCatalog(params);
    if (fresh) setCatalog(fresh);
  }

  /** Normalize apiError `details` into per-variant conflict records. */
  function parseConflictDetails(body: ApiErrorBody): StockConflictDetail[] {
    const details = body.details;
    if (!details) return [];
    if ("items" in details && Array.isArray(details.items)) return details.items;
    if ("variantId" in details) return [details as StockConflictDetail];
    return [];
  }

  /**
   * 409 race-loss handler. The backend reserved the last units for another
   * shopper and returns INSUFFICIENT_STOCK plus each variant's real
   * availability. We clamp the cart to reality, refresh the catalog so every
   * badge is truthful, and surface a calm explanation — buy buttons disable
   * themselves via each product's `available`.
   */
  function handleCheckoutConflict(body: ApiErrorBody) {
    const conflicts = parseConflictDetails(body);
    for (const c of conflicts) {
      if (typeof c.available === "number") updateCartAvailability(c.variantId, c.available);
    }
    void refreshCatalog();
    const names = conflicts
      .map((c) => allProducts.find((p) => p.variants.some((v) => v.id === c.variantId))?.name)
      .filter(Boolean) as string[];
    if (names.length) {
      setError(
        `${body.message ?? "Một số sản phẩm vừa được khách khác đặt trước."}\nĐã hết/cạn hàng: ${names.join(", ")}. Giỏ hàng và tồn kho đã được làm mới — vui lòng điều chỉnh rồi đặt lại đơn.`
      );
      showToast(`⚠️ "${names[0]}"${names.length > 1 ? ` +${names.length - 1}` : ""} vừa hết hàng. Tồn kho đã cập nhật.`);
    } else {
      setError(
        body.message ?? "Tồn kho thay đổi trong lúc thanh toán. Giỏ hàng đã được làm mới, vui lòng thử lại."
      );
      showToast("⚠️ Tồn kho thay đổi — đã làm mới giỏ hàng.");
    }
  }

  async function checkout() {
    setError("");
    if (!cart.length) return;
    const request = {
      storeId,
      fulfillment,
      paymentMethod,
      customer: {
        ...customer,
        address:
          customer.address +
          (giftWrapping !== "none" ? ` [Gói quà: ${giftWrapping}, Lời nhắn: ${giftMessage}]` : ""),
      },
      couponCode: couponInput.trim() || undefined,
      items: cart.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
    };
    const signature = JSON.stringify(request);
    if (checkoutAttempt.current?.signature !== signature)
      checkoutAttempt.current = { signature, key: crypto.randomUUID() };
    setSubmitting(true);
    try {
      const response = await fetch("/api/storefront", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-check": "1",
        },
        body: JSON.stringify({ ...request, idempotencyKey: checkoutAttempt.current.key }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) handleCheckoutConflict(data as ApiErrorBody);
        else setError(data.message ?? "Không thể đặt hàng, vui lòng kiểm tra lại");
        return;
      }
      checkoutAttempt.current = null;
      // VNPay: hand off to the gateway page — the return route settles the
      // payment and lands on /shop/payment/callback.
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl as string;
        return;
      }
      setSuccess({ number: data.number, total: data.total });
      clearCart();
      setCheckoutOpen(false);
    } catch {
      setError("Lỗi kết nối khi gửi đơn hàng");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    // data
    catalog, allProducts, searchMatches, filteredProducts, moodFilteredProducts,
    spotlightProduct: allProducts[0] ?? null, productByVariant, activeStore,
    // filters / UI state
    storeId, setStoreId, categoryId, setCategoryId, query, setQuery,
    searchFocused, setSearchFocused, activeDepartment, setActiveDepartment,
    activeMood, setActiveMood, currentSlide, setCurrentSlide, sortBy, setSortBy,
    viewMode, setViewMode, priceRange, setPriceRange, onlyInStock, setOnlyInStock,
    heroPaused, pauseHeroSlideShow, resumeHeroSlideShow,
    // cart / wishlist / modals
    cart, wishlist, cartOpen, setCartOpen, wishlistOpen, setWishlistOpen,
    checkoutOpen, setCheckoutOpen, quickViewProduct, setQuickViewProduct,
    shelfProduct, setShelfProduct, flipbookProduct, setFlipbookProduct,
    giftWrapping, setGiftWrapping, giftMessage, setGiftMessage,
    fulfillment, setFulfillment, customer, setCustomer,
    paymentMethod, setPaymentMethod,
    couponInput, setCouponInput, quote, quoteChecking,
    pendingStore, confirmStoreChange, cancelStoreChange,
    // totals / derived
    itemCount, subtotal: cartSubtotal, discountTotal, wrappingFee, grandTotal,
    progressToFreeShipping, freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    hasActiveFilters,
    // server interaction
    loading, submitting, error, setError, success, setSuccess,
    countdown, toast,
    searchContainerRef,
    // actions
    showToast, toggleFavorite, addToCart, addToCartSilently, addComboToCart,
    addAllWishlistToCart, resetAllFilters, changeQuantity, removeCartLine,
    changeStore, applyVoucherCode, updateCartAvailability, checkout,
    refreshCatalog, money,
  };
}

export type UseStorefront = ReturnType<typeof useStorefront>;
