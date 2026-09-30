"use client";

import { ShoppingBag } from "lucide-react";
import Cart from "@/components/order/Cart";
import type { CartItem } from "@/types/models";

export default function OrdersScreen({
  items,
  onSetQty,
  onRemove,
  total,
  orderNote,
  onSetOrderNote,
  onCheckout,
}: {
  items: CartItem[];
  onSetQty: (index: number, qty: number) => void;
  onRemove: (index: number) => void;
  total: number;
  orderNote: string;
  onSetOrderNote: (notes: string) => void;
  onCheckout: () => void;
}) {
  return (
    <div className="flex w-full max-w-md flex-col overflow-hidden">
      <div className="px-6 pb-3 pt-6">
        <h1 className="font-display text-2xl font-extrabold text-leaf-900">Your Order</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Cart
          items={items}
          onSetQty={onSetQty}
          onRemove={onRemove}
          total={total}
          orderNote={orderNote}
          onSetOrderNote={onSetOrderNote}
        />
      </div>
      <div className="border-t border-border p-5">
        <div className="mb-4 flex items-center justify-between text-lg font-extrabold">
          <span>Total</span>
          <span>₱{total.toFixed(0)}</span>
        </div>
        <button
          type="button"
          onClick={onCheckout}
          disabled={items.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-turmeric-500 py-3.5 text-sm font-extrabold uppercase tracking-wide text-charcoal-900 shadow-brand transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40"
        >
          <ShoppingBag size={18} /> Proceed to Payment
        </button>
      </div>
    </div>
  );
}
