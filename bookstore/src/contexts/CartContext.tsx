"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { parseAgentCartParam } from "@/lib/agent-cart";
import { csrfHeaders } from "@/lib/csrf-client";

const CART_KEY = "melio.storefront.cart.v1";

export type CartLine = {
  variantId: string;
  productId: string;
  name: string;
  category: string;
  brand?: string;
  price: number;
  quantity: number;
  available: number;
};

type CartContextType = {
  cart: CartLine[];
  addItem: (item: Omit<CartLine, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clearCart: () => void;
  itemCount: number;
  subtotal: number;
};

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage after mount (hydration safe). An agent checkout
  // card may append ?agent_cart=<payload>: merge those lines (names/prices
  // resolve at quote time) then strip the param so refreshes don't re-add.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
      if (Array.isArray(stored)) setCart(stored);
    } catch {}
    try {
      const url = new URL(window.location.href);
      const agentLines = parseAgentCartParam(url.searchParams.get("agent_cart"));
      if (agentLines.length > 0) {
        setCart((prev) => {
          const merged = [...prev];
          for (const line of agentLines) {
            const existing = merged.find((l) => l.variantId === line.variantId);
            if (existing) {
              existing.quantity = Math.min(existing.quantity + line.quantity, existing.available || 99);
            } else {
              merged.push({
                variantId: line.variantId,
                productId: "",
                // Display hint from the server-rendered card; the quote and
                // checkout engines re-price by variantId server-side.
                name: line.name ?? "Sản phẩm từ Thủ thư AI",
                category: "",
                price: line.price ?? 0,
                quantity: line.quantity,
                available: 99,
              });
            }
          }
          return merged;
        });
        url.searchParams.delete("agent_cart");
        window.history.replaceState(null, "", url.toString());
      }
    } catch {}
    setLoaded(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }
  }, [cart, loaded]);

  // ── Two-way server sync (guest phone from a past order, or memberId) ──
  // Pull once on mount when a host-known identity exists; push after that so
  // the agent sees the same lines. agent_cart merges first (above), then a
  // later pull overrides with the server truth. Store optional: sync is
  // per store when the host pins one, global otherwise.
  useEffect(() => {
    if (!loaded) return;
    try {
      const syncId = localStorage.getItem("melio.storefront.sync");
      if (!syncId) return;
      const raw = JSON.parse(syncId) as { phone?: string; customerId?: string; storeId?: string };
      if (!raw.phone && !raw.customerId) return;
      const qs = new URLSearchParams();
      if (raw.customerId) qs.set("customerId", raw.customerId);
      if (raw.phone) qs.set("phone", raw.phone);
      if (raw.storeId) qs.set("storeId", raw.storeId);
      let cancelled = false;
      fetch(`/api/storefront/cart?${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d?.cart?.items) return;
          // Merge server into local: server quantities win, local-only stays.
          setCart((prev) => {
            const byId = new Map(prev.map((l) => [l.variantId, l]));
            for (const line of d.cart.items as { variantId: string; quantity: number }[]) {
              const existing = byId.get(line.variantId);
              if (existing) existing.quantity = line.quantity;
              else
                byId.set(line.variantId, {
                  variantId: line.variantId,
                  productId: "",
                  name: "Sản phẩm đã lưu",
                  category: "",
                  price: 0,
                  quantity: line.quantity,
                  available: 99,
                });
            }
            return [...byId.values()];
          });
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    } catch {
      // sync is best-effort — never block the storefront
    }
  }, [loaded]);

  useEffect(() => {
    if (!loaded || cart.length === 0) return;
    try {
      const syncId = localStorage.getItem("melio.storefront.sync");
      if (!syncId) return;
      const raw = JSON.parse(syncId) as { phone?: string; customerId?: string; storeId?: string };
      if (!raw.phone && !raw.customerId) return;
      const t = setTimeout(async () => {
        fetch("/api/storefront/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
          body: JSON.stringify({
            ...raw,
            items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          }),
        }).catch(() => {});
      }, 2000);
      return () => clearTimeout(t);
    } catch {
      // best-effort
    }
  }, [cart, loaded]);

  const addItem = useCallback((item: Omit<CartLine, "quantity"> & { quantity?: number }) => {
    const qty = item.quantity ?? 1;
    setCart((prev) => {
      const existing = prev.find((line) => line.variantId === item.variantId);
      if (existing) {
        return prev.map((line) =>
          line.variantId === item.variantId
            ? { ...line, quantity: Math.min(line.quantity + qty, item.available) }
            : line
        );
      }
      return [...prev, { ...item, quantity: qty }];
    });
  }, []);

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((line) => line.variantId !== variantId);
      return prev.map((line) =>
        line.variantId === variantId
          ? { ...line, quantity: Math.min(quantity, line.available) }
          : line
      );
    });
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setCart((prev) => prev.filter((line) => line.variantId !== variantId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.quantity * line.price, 0);

  return (
    <CartContext.Provider
      value={{ cart, addItem, updateQuantity, removeItem, clearCart, itemCount, subtotal }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
