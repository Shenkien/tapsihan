"use client";

import { useState } from "react";
import { Store, Smartphone, UserRound, Clock, List, ChefHat, CheckCircle2 } from "lucide-react";
import { orderItemName, orderItemComboContents, type OrderRecord } from "@/types/models";
import { formatRelativeShort, orderSourceLabel } from "@/lib/utils";
import { useNow } from "@/hooks/useNow";
import {
  AGE_AWAITING_CARD,
  AGE_CHIP,
  AWAITING_AGE,
  HighlightedOrderNo,
  OrderNoteStrip,
  PaymentMethodPill,
  ageLevel,
  minutesSince,
} from "@/components/staff/orderHighlights";
import OrderCard, {
  DeclineButton,
  PickedUpButton,
  ReprintKitchenButton,
} from "@/components/staff/OrderCard";

function SectionHeader({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="whitespace-nowrap text-sm font-bold uppercase tracking-wide text-charcoal-900/60">
        {label}
      </h2>
      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-achuete-600 px-1.5 text-xs font-bold text-white">
        {count}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

// The four states staff can filter the queue down to. "ALL" is the normal,
// unfiltered view (all three sections, as before).
type StatusFilter = "ALL" | "AWAITING" | "KITCHEN" | "DONE";

function FilterPills({
  value,
  onChange,
  counts,
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  counts: { all: number; awaiting: number; kitchen: number; done: number };
}) {
  const options: { key: StatusFilter; label: string; count: number; Icon: typeof List }[] = [
    { key: "ALL", label: "All", count: counts.all, Icon: List },
    { key: "AWAITING", label: "Awaiting Payment", count: counts.awaiting, Icon: Clock },
    { key: "KITCHEN", label: "In the Kitchen", count: counts.kitchen, Icon: ChefHat },
    { key: "DONE", label: "Order Done", count: counts.done, Icon: CheckCircle2 },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
              active
                ? "border-achuete-600 bg-achuete-600 text-white"
                : "border-border bg-white text-charcoal-900/60 hover:border-achuete-600/40"
            }`}
          >
            <opt.Icon size={14} />
            {opt.label}
            <span
              className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] ${
                active ? "bg-white/25 text-white" : "bg-charcoal-900/10 text-charcoal-900/60"
              }`}
            >
              {opt.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Card version of the "Awaiting Payment" row — matches the "In the Kitchen"
// card look instead of a full-width single line. Tapping a CASH card opens
// the cash-confirmation panel; GCash cards are disabled while waiting.
function AwaitingPaymentCard({
  order,
  onSelect,
  expanded = false,
  highlight = "",
}: {
  order: OrderRecord;
  onSelect: () => void;
  /** Digits typed into the search box — highlighted in the order number. */
  highlight?: string;
  // Full itemized layout, matching the expanded "In the Kitchen" card —
  // used while searching, so the single matching result shows every
  // detail at a glance instead of the compact summary line.
  expanded?: boolean;
}) {
  const now = useNow();
  const isCash = order.paymentMethod === "CASH";
  const SourceIcon = order.source === "KIOSK" ? Store : order.source === "COUNTER" ? UserRound : Smartphone;
  const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
  const level = ageLevel(minutesSince(order.createdAt, now), AWAITING_AGE);
  const searched = highlight.trim().length > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col gap-3 rounded-2xl border border-l-4 border-border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-brand ${AGE_AWAITING_CARD[level]} ${
        searched ? "ring-2 ring-turmeric-500" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="big-number text-2xl text-charcoal-900">
          <HighlightedOrderNo orderNo={order.orderNo} term={highlight} />
        </span>
        <span className="flex items-center gap-1 rounded-full bg-danger px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white">
          <Clock size={13} /> Not Paid
        </span>
        <PaymentMethodPill method={order.paymentMethod} />
        <span className="flex items-center gap-3 text-sm text-charcoal-900/60">
          <span className="flex items-center gap-1">
            <SourceIcon size={14} /> {orderSourceLabel(order.source)}
          </span>
          <span aria-hidden>·</span>
          <span className={`flex items-center gap-1 ${AGE_CHIP[level]}`}>
            <Clock size={14} /> {formatRelativeShort(order.createdAt)}
          </span>
        </span>
      </div>

      <OrderNoteStrip notes={order.notes} className="-mx-4 rounded-none" />

      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-charcoal-900/60">
          {order.type === "DINE_IN" ? "Dine-in" : "Takeout"} · {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
        {!expanded && <span className="text-lg font-bold">₱{order.total.toFixed(2)}</span>}
      </div>

      {expanded && (
        <>
          <div className="divide-y divide-border border-t border-border">
            {order.items.map((item) => {
              const combo = orderItemComboContents(item);
              return (
                <div key={item.id} className="py-2">
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
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-bold text-charcoal-900/60">Total</span>
            <span className="text-lg font-bold">₱{order.total.toFixed(2)}</span>
          </div>
        </>
      )}

      <span className="text-sm font-bold text-achuete-600">
        {isCash ? "Tap to confirm cash payment" : "Tap to confirm GCash payment"}
      </span>
    </button>
  );
}

// Card version of a completed order — matches the same card grid instead of
// a full-width single line.
function DoneCard({
  order,
  expanded = false,
  highlight = "",
}: {
  order: OrderRecord;
  /** Digits typed into the search box — highlighted in the order number. */
  highlight?: string;
  // Full itemized layout, matching the expanded "In the Kitchen" / "Awaiting
  // Payment" cards — used while searching, so a matched completed order
  // shows every line item and payment method instead of just the summary.
  expanded?: boolean;
}) {
  const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border border-l-4 border-border border-l-success-text bg-white p-4 ${
        highlight.trim() ? "ring-2 ring-turmeric-500" : "opacity-70"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="big-number text-2xl text-charcoal-900">
          <HighlightedOrderNo orderNo={order.orderNo} term={highlight} />
        </span>
        <span className="flex items-center gap-1 rounded-full bg-success-bg px-3 py-1 text-xs font-bold text-success-text">
          <CheckCircle2 size={13} /> Done
        </span>
        {expanded && (
          <span className="text-sm text-charcoal-900/60">
            {order.type === "DINE_IN" ? "Dine-in" : "Takeout"} ·{" "}
            {orderSourceLabel(order.source)}
            {order.paymentMethod ? ` · ${order.paymentMethod === "CASH" ? "Cash" : "GCash"}` : ""}
          </span>
        )}
      </div>

      {!expanded && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-charcoal-900/60">
            {order.type === "DINE_IN" ? "Dine-in" : "Takeout"} · {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <span className="text-lg font-bold">₱{order.total.toFixed(2)}</span>
        </div>
      )}

      {expanded && (
        <div className="divide-y divide-border border-t border-border">
          {order.items.map((item) => {
            const combo = orderItemComboContents(item);
            return (
              <div key={item.id} className="py-2">
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
      )}

      {expanded && order.notes && (
        <p className="border-t border-border pt-2 text-sm italic text-charcoal-900/70">
          Note: {order.notes}
        </p>
      )}

      {expanded && (
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-bold text-charcoal-900/60">Total</span>
          <span className="text-lg font-bold">₱{order.total.toFixed(2)}</span>
        </div>
      )}

      <span className="text-sm font-bold text-charcoal-900/60">
        Picked up{" "}
        {order.completedAt
          ? new Date(order.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : ""}
      </span>
    </div>
  );
}

export default function OrderQueue({
  orders,
  searchTerm,
  onClearSearch,
  onSelectAwaiting,
  onCancel,
  onComplete,
  onReprintKitchen,
}: {
  orders: OrderRecord[];
  // Digits-only order number typed into the header search box + Enter.
  // Empty string means "not searching" — show the normal full queue.
  searchTerm: string;
  onClearSearch: () => void;
  onSelectAwaiting: (order: OrderRecord) => void;
  onCancel: (orderId: number) => void;
  onComplete: (orderId: number) => void;
  onReprintKitchen: (orderNo: string) => void;
}) {
  // "In the Kitchen" cards default to a collapsed one-line summary; tapping
  // a card reveals its full itemized order. Track expanded state by order id.
  // While searching, cards auto-expand (see `expanded` below) regardless of
  // this set, so staff see every detail immediately without an extra tap.
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  function toggleExpanded(orderId: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  // Which section(s) to show. "ALL" (default) behaves exactly as before.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const sorted = [...orders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const isSearching = searchTerm.trim().length > 0;
  const matchesSearch = (order: OrderRecord) => order.orderNo.includes(searchTerm.trim());

  const awaitingPaymentAll = sorted.filter((o) => o.status === "CREATED");
  // Paid orders go straight to the kitchen automatically — the printed
  // receipt is the kitchen's only ticket, so cooking starts the moment it's
  // paid. There's no manual "send to kitchen" step. Staff act again once
  // the food comes back from the kitchen: call the customer out, then tap
  // "Picked Up" the moment the customer actually takes it — there's no
  // separate "ready" state in between.
  const inKitchenAll = sorted.filter((o) => o.status === "PAID");
  // Completed today — the "Order Done" history list. Most recently picked
  // up first, since that's what staff want to check first.
  const doneAll = [...sorted]
    .filter((o) => o.status === "COMPLETED")
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());

  // When searching, every section narrows down to just the matching
  // order(s) — "Not Paid" orders stay in Awaiting Payment, in-progress
  // orders stay in "In the Kitchen", etc. — and the matching card(s) are
  // centered on screen instead of sitting in the normal grid.
  const awaitingPaymentSearched = isSearching ? awaitingPaymentAll.filter(matchesSearch) : awaitingPaymentAll;
  const inKitchenSearched = isSearching ? inKitchenAll.filter(matchesSearch) : inKitchenAll;
  const doneSearched = isSearching ? doneAll.filter(matchesSearch) : doneAll;

  // Status filter narrows further, on top of any active search — pick
  // "Awaiting Payment" and only that section renders, no matter what else
  // is in the queue or what was searched for.
  const showAwaiting = statusFilter === "ALL" || statusFilter === "AWAITING";
  const showKitchen = statusFilter === "ALL" || statusFilter === "KITCHEN";
  const showDone = statusFilter === "ALL" || statusFilter === "DONE";

  const awaitingPayment = showAwaiting ? awaitingPaymentSearched : [];
  const inKitchen = showKitchen ? inKitchenSearched : [];
  const done = showDone ? doneSearched : [];

  const noResults = isSearching && awaitingPayment.length === 0 && inKitchen.length === 0 && done.length === 0;

  const filterCounts = {
    all: awaitingPaymentSearched.length + inKitchenSearched.length + doneSearched.length,
    awaiting: awaitingPaymentSearched.length,
    kitchen: inKitchenSearched.length,
    done: doneSearched.length,
  };

  if (sorted.length === 0) {
    return <p className="opacity-60">No active orders.</p>;
  }

  const gridClass = isSearching
    ? "flex flex-col items-center gap-4"
    : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";
  // Awaiting Payment cards are narrower than the others, so they get a 4th
  // column once there's room for it (falls back to the same 3-column/2-
  // column/1-column breakpoints as every other section below that).
  const awaitingGridClass = isSearching
    ? "flex flex-col items-center gap-4"
    : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  const cardWrapClass = isSearching ? "w-full max-w-md" : undefined;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <FilterPills value={statusFilter} onChange={setStatusFilter} counts={filterCounts} />

      <div className="flex flex-col gap-8">
        {isSearching && (
          <div className="mx-auto flex w-full max-w-md items-center justify-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-sm">
            <span className="text-charcoal-900/70">
              Showing results for <strong>#{searchTerm}</strong>
            </span>
            <button type="button" onClick={onClearSearch} className="font-bold text-achuete-600 hover:underline">
              Clear
            </button>
          </div>
        )}

        {noResults && (
          <p className="text-center opacity-60">No orders found matching “#{searchTerm}”.</p>
        )}

        {showAwaiting && (awaitingPayment.length > 0 || (!isSearching && statusFilter === "AWAITING")) && (
          <section>
            <SectionHeader label="Awaiting Payment" count={awaitingPayment.length} />
            {awaitingPayment.length === 0 ? (
              <p className="text-sm opacity-60">No orders awaiting payment.</p>
            ) : (
              <div className={awaitingGridClass}>
                {awaitingPayment.map((order) => (
                  <div key={order.id} className={cardWrapClass}>
                    <AwaitingPaymentCard
                      order={order}
                      onSelect={() => onSelectAwaiting(order)}
                      // While searching, show the full itemized card
                      // (matching the "In the Kitchen" expanded look)
                      // instead of the compact summary line.
                      expanded={isSearching}
                      highlight={isSearching ? searchTerm : ""}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {showKitchen && (inKitchen.length > 0 || (!isSearching && statusFilter === "KITCHEN")) && (
          <section>
            <SectionHeader label="In the Kitchen" count={inKitchen.length} />
            {inKitchen.length === 0 ? (
              <p className="text-sm opacity-60">No orders in the kitchen.</p>
            ) : (
              <div className={gridClass}>
                {inKitchen.map((order) => (
                  <div key={order.id} className={cardWrapClass}>
                    <OrderCard
                      order={order}
                      badge="InKitchen"
                      // Auto-expand every matching card while searching, so
                      // staff see the full itemized order right away.
                      expanded={isSearching || expandedIds.has(order.id)}
                      onToggle={() => toggleExpanded(order.id)}
                      highlight={isSearching ? searchTerm : ""}
                      actions={
                        <>
                          {/* Picked Up: tap once the customer actually takes the
                              food — closes the order straight to "Order Done". */}
                          <ReprintKitchenButton onClick={() => onReprintKitchen(order.orderNo)} />
                          <PickedUpButton onClick={() => onComplete(order.id)} />
                          <DeclineButton onClick={() => onCancel(order.id)} />
                        </>
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {showDone && (done.length > 0 || (!isSearching && statusFilter === "DONE")) && (
          <section>
            <SectionHeader label="Order Done" count={done.length} />
            {done.length === 0 ? (
              <p className="text-sm opacity-60">No completed orders yet.</p>
            ) : (
              <div className={gridClass}>
                {done.map((order) => (
                  <div key={order.id} className={cardWrapClass}>
                    <DoneCard order={order} expanded={isSearching} highlight={isSearching ? searchTerm : ""} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
