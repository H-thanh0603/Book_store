"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

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

  // Load from localStorage after mount (hydration safe)
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
      if (Array.isArray(stored)) setCart(stored);
    } catch {}
    setLoaded(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
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
