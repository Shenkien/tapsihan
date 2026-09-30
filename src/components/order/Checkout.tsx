"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, Banknote, CheckCircle2, ShoppingBag, UtensilsCrossed, Wallet } from "lucide-react";
import { fetchGcashConfig } from "@/lib/gcashAccountInfo";
import type { CartItem, OrderType, PaymentMethod } from "@/types/models";

const METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "CASH", label: "Cash", icon: Banknote },
  { id: "GCASH", label: "GCash", icon: Wallet },
];

export default function Checkout({
  items,
  total,
  notes,
  orderType = null,
  onBack,
  onPay,
  submitting = false,
}: {
  items: CartItem[];
  total: number;
  notes?: string;
  /** The Dine-in / Takeout choice made earlier — shown again here so it can be double-checked before paying. */
  orderType?: OrderType | null;
  onBack: () => void;
  onPay: (method: PaymentMethod) => void;
  /** True once an order submit is in flight — see submittingRef in OrderFlow. */
  submitting?: boolean;
}) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  // GCash needs a saved QR to pay to. Only an explicit "not set up" hides it;
  // if the check itself fails we keep GCash available rather than take a
  // payment option away because of a network blip.
  const [gcashConfigured, setGcashConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchGcashConfig().then((cfg) => {
      if (cancelled) return;
      const configured = cfg.status === "ok" ? cfg.configured : null;
      setGcashConfigured(configured);
      if (configured === false) setMethod((m) => (m === "GCASH" ? "CASH" : m));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const gcashUnavailable = gcashConfigured === false;

  return (
    <div className="flex flex-1 flex-col bg-rice-50 text-charcoal-900">
      <div className="flex shrink-0 items-center gap-3 bg-leaf-900 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-rice-50 sm:px-5 sm:pb-4 sm:pt-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
        >
          <ChevronLeft size={22} />
        </button>
        <h2 className="text-lg font-extrabold uppercase tracking-wide">Checkout</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-charcoal-900/60">Order summary</h3>
            {orderType && (
              <span className="flex items-center gap-1.5 rounded-full bg-leaf-900 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-rice-50">
                {orderType === "DINE_IN" ? <UtensilsCrossed size={13} /> : <ShoppingBag size={13} />}
                {orderType === "DINE_IN" ? "Dine-in" : "Takeout"}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">
                  {item.qty}x {item.product.name}
                </span>
                <span className="shrink-0 font-semibold">
                  ₱{(item.product.price * item.qty).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
          {notes && (
            <>
              <Separator className="my-3" />
              <div className="text-sm">
                <span className="font-extrabold uppercase tracking-widest text-charcoal-900/60">Note: </span>
                <span className="italic text-charcoal-900/80">{notes}</span>
              </div>
            </>
          )}
          <Separator className="my-3" />
          <div className="flex items-center justify-between rounded-xl bg-turmeric-500/20 px-3 py-2.5 text-lg font-extrabold">
            <span>Total to pay</span>
            <span className="text-2xl text-achuete-600 sm:text-3xl">₱{total.toFixed(0)}</span>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-xs font-extrabold uppercase tracking-widest text-charcoal-900/60">
            Choose payment method
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {METHODS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMethod(id)}
                disabled={id === "GCASH" && gcashUnavailable}
                aria-pressed={method === id}
                className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition ${
                  method === id
                    ? "border-achuete-600 bg-turmeric-500/25 shadow-brand ring-4 ring-achuete-600/20"
                    : "border-border bg-white opacity-80"
                } ${id === "GCASH" && gcashUnavailable ? "cursor-not-allowed opacity-40" : ""}`}
              >
                {method === id && (
                  <CheckCircle2 size={20} className="absolute right-2 top-2 text-achuete-600" aria-hidden />
                )}
                <Icon size={24} className="text-achuete-600" />
                <span className="text-sm font-extrabold uppercase tracking-wide text-charcoal-900">{label}</span>
                {id === "GCASH" && gcashUnavailable && (
                  <span className="text-[11px] font-semibold normal-case text-charcoal-900/60">Not available right now</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 shrink-0 border-t border-border bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_20px_-8px_rgba(139,0,0,0.15)]">
        <Button
          className="w-full bg-turmeric-500 text-charcoal-900 hover:bg-turmeric-500"
          onClick={() => onPay(method)}
          disabled={submitting}
        >
          {submitting ? "Placing order…" : `Pay Now · ₱${total.toFixed(0)}`}
        </Button>
      </div>
    </div>
  );
}
