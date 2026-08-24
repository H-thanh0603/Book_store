// useStorefront — single hook that owns ALL stateful logic for the shop page.
// Centralising here lets `page.tsx` stay a thin orchestrator that only wires
// sections together, and keeps the 409 race-recovery flow in one place
// (`handleCheckoutConflict`).
//
// Ported from the original 2.5k-line shop/page.tsx; behaviour preserved.

import { useEffect, useMemo, useRef, useState } from "react";

import { money, CART_KEY, WISHLIST_KEY, readingAtmospheres } from "./data";
import type {
  Catalog,
  CartLine,
  Fulfillment,
  GiftWrapping,
  Product,
  StockConflictDetail,
} from "./types";

export type Toast = { id: string; message: string };

const defaultCustomer = { name: "", phone: "", email: "", address: "" };
const FREE_SHIPPING_THRESHOLD = 250000;

/** Body of a backend error as returned by apiError (details surfaced on 409). */
type ApiErrorBody = {
  code?: string;
  message?: string;
  requestId?: string;
  details?: StockConflictDetail | { items?: StockConflictDetail[] };
};

export function useStorefront() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [storeId, setStoreId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeDepartment, setActiveDepartment] = useState("all");
  const [activeMood, setActiveMood] = useState("rain");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
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
  const [success, setSuccess] = useState<{ number: string; total: number } | null>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
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

  // Load cart & wishlist from localStorage (deferred past mount for hydration).
  useEffect(() => {
    let storedCart: CartLine[] = [];
    let storedWishlist: string[] = [];
    try {
      storedCart = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
      storedWishlist = JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? "[]");
    } catch {}
    const t = setTimeout(() => {
      setCart(storedCart);
      setWishlist(storedWishlist);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  }, [wishlist]);

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

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.quantity * line.price, 0);
  const wrappingFee = giftWrapping === "vintage" ? 25000 : giftWrapping === "heritage" ? 45000 : 0;
  const grandTotal = subtotal + wrappingFee;
  const activeStore = catalog?.stores.find((store) => store.id === storeId);
  const progressToFreeShipping = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));
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
    setCart((lines) => {
      const current = lines.find((line) => line.variantId === variant.id);
      if (current)
        return lines.map((line) =>
          line.variantId === variant.id
            ? {
                ...line,
                quantity: Math.min(line.quantity + 1, variant.available),
                available: variant.available,
              }
            : line
        );
      return [
        ...lines,
        {
          variantId: variant.id,
          productId: product.id,
          name: product.name,
          category: product.category.name,
          brand: product.brand?.name,
          price: variant.price,
          quantity: 1,
          available: variant.available,
        },
      ];
    });
    showToast(`✨ Đã thêm "${product.name}" vào giỏ hàng!`);
    setCartOpen(true);
  }

  function addComboToCart(bundle: { title: string }) {
    const firstProduct = allProducts[0];
    if (firstProduct && firstProduct.variants[0]) {
      addToCart(firstProduct);
      showToast(`🎁 Đã thêm trọn gói "${bundle.title}" vào giỏ hàng!`);
    }
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
    setCart((lines) =>
      lines.flatMap((line) => {
        if (line.variantId !== variantId) return [line];
        const latest = productByVariant.get(variantId)?.variant.available ?? line.available;
        const quantity = Math.min(line.quantity + delta, latest);
        return quantity > 0 ? [{ ...line, quantity, available: latest }] : [];
      })
    );
  }

  function removeCartLine(variantId: string) {
    setCart((lines) => lines.filter((line) => line.variantId !== variantId));
  }

  function changeStore(nextStoreId: string) {
    if (
      cart.length &&
      !window.confirm("Đổi chi nhánh sẽ làm mới giỏ hàng để cập nhật tồn kho thực tế. Bạn có muốn tiếp tục?")
    )
      return;
    setCart([]);
    setStoreId(nextStoreId);
  }

  function applyVoucherCode(code: string) {
    setCouponInput(code);
    navigator.clipboard.writeText(code);
    showToast(`🎟️ Đã sao chép mã ưu đãi "${code}"!`);
  }

  /** Clamp one cart line to freshly-reported availability (post-409 recovery). */
  function updateCartAvailability(variantId: string, available: number) {
    setCart((lines) =>
      lines.map((line) =>
        line.variantId === variantId
          ? { ...line, available, quantity: Math.min(line.quantity, available) }
          : line
      )
    );
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, idempotencyKey: checkoutAttempt.current.key }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) handleCheckoutConflict(data as ApiErrorBody);
        else setError(data.message ?? "Không thể đặt hàng, vui lòng kiểm tra lại");
        return;
      }
      checkoutAttempt.current = null;
      setSuccess({ number: data.number, total: data.total });
      setCart([]);
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
    // cart / wishlist / modals
    cart, wishlist, cartOpen, setCartOpen, wishlistOpen, setWishlistOpen,
    checkoutOpen, setCheckoutOpen, quickViewProduct, setQuickViewProduct,
    shelfProduct, setShelfProduct, flipbookProduct, setFlipbookProduct,
    giftWrapping, setGiftWrapping, giftMessage, setGiftMessage,
    fulfillment, setFulfillment, customer, setCustomer,
    couponInput, setCouponInput,
    // totals / derived
    itemCount, subtotal, wrappingFee, grandTotal, progressToFreeShipping,
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD, hasActiveFilters,
    // server interaction
    loading, submitting, error, setError, success, setSuccess,
    countdown, toast,
    searchContainerRef,
    // actions
    showToast, toggleFavorite, addToCart, addComboToCart, addAllWishlistToCart,
    resetAllFilters, changeQuantity, removeCartLine, changeStore, applyVoucherCode,
    updateCartAvailability, checkout, refreshCatalog, money,
  };
}

export type UseStorefront = ReturnType<typeof useStorefront>;
