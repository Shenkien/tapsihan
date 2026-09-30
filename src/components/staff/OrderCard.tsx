"use client";

import { Store, Smartphone, UserRound, Clock, X, ChevronDown, ChefHat, CheckCircle2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeShort, orderSourceLabel } from "@/lib/utils";
import { useNow } from "@/hooks/useNow";
import {
  AGE_CARD,
  AGE_CHIP,
  HighlightedOrderNo,
  KITCHEN_AGE,
  OrderNoteStrip,
  PaymentMethodPill,
  ageLevel,
  minutesSince,
} from "@/components/staff/orderHighlights";
import { orderItemName, orderItemComboContents, type OrderRecord } from "@/types/models";

// Status colors, consistent everywhere a badge like this shows up: yellow
// (turmeric) for anything still in progress — awaiting payment or cooking —
// green (success) once it's actually done and picked up.
const BADGE_META: Record<string, { className: string; label: string; Icon: typeof ChefHat }> = {
  InKitchen: { className: "bg-turmeric-500 text-charcoal-900", label: "In the Kitchen", Icon: ChefHat },
  Done: { className: "bg-success-bg text-success-text", label: "Done", Icon: CheckCircle2 },
};

export default function OrderCard({
  order,
  badge,
  actions,
  expanded,
  onToggle,
  highlight = "",
}: {
  order: OrderRecord;
  badge: keyof typeof BADGE_META;
  actions: React.ReactNode;
  // Collapsed by default — the card shows one line (order #, source, time,
  // item count, total). Tapping the header reveals the full itemized order,
  // the same way the "Awaiting Payment" row expands into the cash panel.
  expanded: boolean;
  onToggle: () => void;
  /** Digits typed into the search box — highlighted in the order number. */
  highlight?: string;
}) {
  const now = useNow();
  const meta = BADGE_META[badge];
  const SourceIcon = order.source === "KIOSK" ? Store : order.source === "COUNTER" ? UserRound : Smartphone;
  const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
  // Time in the kitchen runs from when it was paid (falls back to when it was placed).
  const startedAt = order.paidAt ?? order.createdAt;
  const level = ageLevel(minutesSince(startedAt, now), KITCHEN_AGE);
  const searched = highlight.trim().length > 0;

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-l-4 border-border shadow-sm transition hover:shadow-brand ${AGE_CARD[level]} ${
        searched ? "ring-2 ring-turmeric-500" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="big-number text-2xl text-charcoal-900">
            <HighlightedOrderNo orderNo={order.orderNo} term={highlight} />
          </span>
          <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${meta.className}`}>
            <meta.Icon size={13} /> {meta.label}
          </span>
          {badge === "InKitchen" && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-white">
              <CheckCircle2 size={13} /> Paid
            </span>
          )}
          <PaymentMethodPill method={order.paymentMethod} />
          <span className="flex items-center gap-3 text-sm text-charcoal-900/60">
            <span className="flex items-center gap-1">
              <SourceIcon size={14} /> {orderSourceLabel(order.source)}
            </span>
            <span aria-hidden>·</span>
            <span className={`flex items-center gap-1 ${AGE_CHIP[level]}`}>
              <Clock size={14} /> {formatRelativeShort(startedAt)}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-charcoal-900/60">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <span className="text-lg font-bold">₱{order.total.toFixed(2)}</span>
          <ChevronDown
            size={18}
            className={`text-charcoal-900/40 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      <OrderNoteStrip notes={order.notes} />

      {expanded && (
        <>
          <div className="divide-y divide-border border-t border-border">
            {order.items.map((item) => {
              const combo = orderItemComboContents(item);
              return (
                <div key={item.id} className="px-4 py-2">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="font-bold">
                      {item.qty}x {orderItemName(item)}
                    </span>
                    <span className="whitespace-nowrap font-bold">₱{(item.unitPrice * item.qty).toFixed(2)}</span>
                  </div>
                  {combo && combo.length > 0 && (
                    <div className="pl-4 text-xs text-charcoal-900/50">
                      {combo.map((ci, i) => (
                        <div key={i}>
                          {ci.qty}x {ci.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-sm font-bold text-charcoal-900/60">Total</span>
            <span className="text-lg font-bold">₱{order.total.toFixed(2)}</span>
          </div>
        </>
      )}

      <div className="flex gap-2 p-4 pt-0">{actions}</div>
    </div>
  );
}

// Small preset action buttons shared by the sections below, so the icons
// and labels stay consistent everywhere they're used.
export function DeclineButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Decline order"
      title="Decline order"
      className="border-danger bg-[#fbe4e1] text-danger hover:bg-red-200"
    >
      <X size={18} />
    </Button>
  );
}

export function PickedUpButton({ onClick }: { onClick: () => void }) {
  return (
    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onClick}>
      Picked Up
    </Button>
  );
}

// Re-sends this order's kitchen ticket to the kitchen's own printer —
// for when the first one jammed, ran out of paper, or got lost. The
// kitchen ticket already fired automatically the moment this order was
// paid (that's why it's already in "In the Kitchen"); this button doesn't
// change the order in any way, it only asks the kitchen printer bridge to
// print that same ticket again. See /api/print-bridge/kitchen/request.
export function ReprintKitchenButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Reprint kitchen ticket"
      title="Reprint kitchen ticket"
      className="border-sky-600 bg-sky-50 text-sky-700 hover:bg-sky-100"
    >
      <Printer size={18} />
    </Button>
  );
}
