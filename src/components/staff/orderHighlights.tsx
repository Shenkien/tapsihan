"use client";

import { Banknote, MessageSquareWarning, Smartphone } from "lucide-react";
import type { OrderRecord } from "@/types/models";

/** Whole minutes between an ISO timestamp and `now` (ms). */
export function minutesSince(iso: string | null | undefined, now: number) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export type AgeLevel = "ok" | "warn" | "urgent";

// How long an order can wait before staff should notice. Awaiting payment is
// shorter (a customer is standing at the counter); the kitchen gets longer.
export const AWAITING_AGE = { warn: 5, urgent: 10 };
export const KITCHEN_AGE = { warn: 10, urgent: 15 };

export function ageLevel(minutes: number, limits: { warn: number; urgent: number }): AgeLevel {
  if (minutes >= limits.urgent) return "urgent";
  if (minutes >= limits.warn) return "warn";
  return "ok";
}

// Written out in full so Tailwind can see every class.
export const AGE_CARD: Record<AgeLevel, string> = {
  ok: "border-l-achuete-600 bg-white",
  warn: "border-l-amber-500 bg-amber-50",
  urgent: "border-l-danger bg-red-50",
};

export const AGE_AWAITING_CARD: Record<AgeLevel, string> = {
  ok: "border-l-amber-400 bg-amber-50/60",
  warn: "border-l-amber-500 bg-amber-100",
  urgent: "border-l-danger bg-red-100",
};

export const AGE_CHIP: Record<AgeLevel, string> = {
  ok: "text-charcoal-900/60",
  warn: "rounded-full bg-amber-200 px-2 py-0.5 font-bold text-amber-900",
  urgent: "rounded-full bg-danger px-2 py-0.5 font-bold text-white",
};

/** Cash or GCash tag — staff need to know at a glance whether to take cash. */
export function PaymentMethodPill({ method }: { method: OrderRecord["paymentMethod"] }) {
  const cash = method === "CASH";
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide ${
        cash ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-800"
      }`}
    >
      {cash ? <Banknote size={13} /> : <Smartphone size={13} />}
      {cash ? "Cash" : "GCash"}
    </span>
  );
}

/** Yellow strip for order notes (allergies, "no onions") — always visible, even on a collapsed card. */
export function OrderNoteStrip({ notes, className = "" }: { notes: string | null | undefined; className?: string }) {
  if (!notes) return null;
  return (
    <div
      className={`flex items-start gap-2 border-y border-turmeric-500/60 bg-turmeric-500/25 px-4 py-2 text-sm font-semibold text-charcoal-900 ${className}`}
    >
      <MessageSquareWarning size={16} className="mt-0.5 shrink-0" />
      <span>
        <span className="font-extrabold uppercase tracking-wide">Note: </span>
        {notes}
      </span>
    </div>
  );
}

/** Order number with the searched digits highlighted. */
export function HighlightedOrderNo({ orderNo, term }: { orderNo: string; term: string }) {
  const t = term.trim();
  const at = t ? orderNo.indexOf(t) : -1;
  if (at < 0) return <>#{orderNo}</>;
  return (
    <>
      #{orderNo.slice(0, at)}
      <mark className="rounded bg-turmeric-500 px-0.5 text-charcoal-900">{orderNo.slice(at, at + t.length)}</mark>
      {orderNo.slice(at + t.length)}
    </>
  );
}
