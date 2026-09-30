"use client";

import { Input } from "@/components/ui/input";
import { Minus, Plus, Trash2 } from "lucide-react";
import { iconForCategory } from "@/components/order/categoryIcon";
import type { CartItem } from "@/types/models";

export default function Cart({
  items,
  onSetQty,
  onRemove,
  total,
  orderNote,
  onSetOrderNote,
}: {
  items: CartItem[];
  onSetQty: (index: number, qty: number) => void;
  onRemove?: (index: number) => void;
  total: number;
  orderNote?: string;
  onSetOrderNote?: (notes: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-charcoal-900/60">
        Your cart is empty. Tap an item to add it.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:p-5">
      {items.map((item, index) => {
        const Icon = iconForCategory(item.product.category);
        return (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm"
          >
            {/* Row 1: photo + name (up to 2 lines) + remove. The old single
                row also held the qty stepper, which left the name only a
                few pixels of width on a 360px phone — so the stepper now
                lives on its own row below. */}
            <div className="flex items-start gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-turmeric-500/15 text-achuete-600">
                {item.product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.product.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon size={24} />
                )}
              </span>

              <p className="line-clamp-2 min-w-0 flex-1 break-words pt-0.5 font-bold leading-tight">
                {item.product.name.replace(/\s*\(Add-on\)\s*$/i, "")}
              </p>

              {onRemove && (
                <button
                  type="button"
                  className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-danger transition hover:bg-danger/10"
                  onClick={() => onRemove(index)}
                  aria-label={`Remove ${item.product.name}`}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>

            {/* Row 2: line price left, stepper right. */}
            <div className="flex items-center justify-between gap-3">
              <p className="big-number text-xl text-achuete-600">
                ₱{(item.product.price * item.qty).toFixed(0)}
              </p>
              <div className="flex items-center gap-1 rounded-full border border-border px-1">
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-leaf-900 transition hover:bg-leaf-900/10"
                  onClick={() => onSetQty(index, item.qty - 1)}
                  aria-label="Decrease quantity"
                >
                  <Minus size={16} />
                </button>
                <span className="min-w-[28px] text-center text-base font-bold">{item.qty}</span>
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-leaf-900 transition hover:bg-leaf-900/10"
                  onClick={() => onSetQty(index, item.qty + 1)}
                  aria-label="Increase quantity"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {onSetOrderNote && (
        <div className="rounded-2xl border border-border bg-white p-3.5 shadow-sm">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-charcoal-900/60">
            Note for your order
          </p>
          <Input
            placeholder="e.g. no bago, extra sauce"
            value={orderNote ?? ""}
            onChange={(e) => onSetOrderNote(e.target.value)}
          />
        </div>
      )}
      <div className="flex justify-between px-1 py-3 text-lg font-extrabold">
        <span>Subtotal</span>
        <span>₱{total.toFixed(0)}</span>
      </div>
    </div>
  );
}
