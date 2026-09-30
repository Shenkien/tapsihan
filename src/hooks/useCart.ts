"use client";

import { useCallback, useMemo, useState } from "react";
import type { CartItem, MenuProduct } from "@/types/models";

// Mirrors the backend's per-line cap (orderItemSchema: qty max 50) — the
// stepper's "+" button had no ceiling, so a customer could tap past 50 in
// the UI, only to have checkout hang (see OrderFlow.handlePay) or, once
// that's fixed, get bounced back with a "Quantity is too high" error the
// "+" button never warned them about. Clamping here keeps the two layers
// in agreement instead of the frontend silently allowing what the backend
// will reject.
const MAX_LINE_QTY = 50;

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  // A note for the whole order (e.g. "no bago, extra sauce"), kept separate
  // from any individual item — it isn't attached to whichever product
  // happens to be first in the cart.
  const [orderNote, setOrderNote] = useState("");

  const addItem = useCallback((product: MenuProduct, qty: number = 1, notes: string = "") => {
    setItems((prev) => {
      // Only merge into an existing line when there's no special-request
      // note to keep distinct — a customized item (with notes/add-ons)
      // always gets its own line so its note stays attached to just it.
      // Combo ids and Product ids are separate id spaces that can collide
      // (both start from 1), so `isCombo` has to match too or a Combo #3
      // could silently merge into a Product #3 already in the cart.
      const existing = !notes
        ? prev.find((i) => i.product.id === product.id && !!i.product.isCombo === !!product.isCombo && !i.notes)
        : undefined;
      if (existing) {
        return prev.map((i) => (i === existing ? { ...i, qty: Math.min(i.qty + qty, MAX_LINE_QTY) } : i));
      }
      return [...prev, { product, qty: Math.min(qty, MAX_LINE_QTY), notes }];
    });
  }, []);

  const setQty = useCallback((index: number, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((_, i) => i !== index);
      const clamped = Math.min(qty, MAX_LINE_QTY);
      return prev.map((item, i) => (i === index ? { ...item, qty: clamped } : item));
    });
  }, []);

  const setNotes = useCallback((index: number, notes: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, notes } : item)));
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setOrderNote("");
  }, []);

  const total = useMemo(() => items.reduce((sum, i) => sum + i.product.price * i.qty, 0), [items]);

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items]);

  return { items, addItem, setQty, setNotes, removeItem, clear, total, itemCount, orderNote, setOrderNote };
}
