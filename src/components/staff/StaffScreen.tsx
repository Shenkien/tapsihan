"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { cn } from "@/lib/utils";
import AccountMenu from "@/components/AccountMenu";
import { usePusherEvent } from "@/hooks/usePusherEvent";
import OrderQueue from "@/components/staff/OrderQueue";
import { fromCentavos, toCentavos } from "@/lib/money";
import { orderItemName, orderItemComboContents, type CounterDiscount, type OrderRecord } from "@/types/models";

// GCash reference numbers are 13 digits (keep in sync with GCASH_REF_LENGTH in lib/validations.ts).
const GCASH_REF_DIGITS = 13;
const GCASH_REF_RE = new RegExp(`^\\d{${GCASH_REF_DIGITS}}$`);

export default function StaffScreen() {
  const [queue, setQueue] = useState<OrderRecord[]>([]);
  // Manual "type an order number, hit Enter" search box — the USB barcode
  // scanner and its auto-submit-on-fast-keystroke-burst detection have
  // been removed; staff now open an order's payment-confirmation panel by
  // tapping it directly in the "Awaiting Payment" list below instead.
  const [scanValue, setScanValue] = useState("");
  // Active order-number search, applied to the queue below on manual Enter.
  // Empty string means "not searching" — the queue shows everything.
  const [searchTerm, setSearchTerm] = useState("");
  const [scannedOrder, setScannedOrder] = useState<OrderRecord | null>(null);
  const [amountReceived, setAmountReceived] = useState("");
  // GCash only: the real reference number staff read off the customer's payment screen.
  const [gcashRef, setGcashRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Guards "Confirm Paid — Send to Kitchen" against a double-click/double-tap
  // firing two overlapping confirm-cash/confirm-gcash requests for the same
  // order (which could each pass the status check before either had
  // committed, printing the kitchen ticket twice). Disabling the button for
  // the duration of the in-flight request closes that specific trigger —
  // the real fix is server-side (see the atomic updateMany in both routes),
  // this just avoids firing the redundant request in the first place.
  const [confirming, setConfirming] = useState(false);

  // Counter discounts (Senior, Student, ...) set up by the admin. The panel
  // below lets staff put one on an unpaid order before taking payment.
  const [discounts, setDiscounts] = useState<CounterDiscount[]>([]);
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  // A 401 means the session ended (expired, or the account was deactivated).
  // Every staff action goes through this check so the screen never just sits
  // there frozen and pretending nothing happened.
  const sendToLogin = useCallback(() => {
    window.location.assign("/login");
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/queue");
      if (res.status === 401) {
        sendToLogin();
        return;
      }
      if (!res.ok) {
        setError("Couldn't refresh the order list. It will retry on the next update.");
        return;
      }
      const list = await res.json();
      if (Array.isArray(list)) setQueue(list);
    } catch {
      // Network drop: keep showing the last queue instead of throwing an
      // unhandled rejection, and say so.
      setError("Can't reach the server. Check the connection — the list may be out of date.");
    }
  }, [sendToLogin]);

  /**
   * POSTs a staff action and reports the outcome. Returns true only when the
   * server accepted it. Failures (409 "already done", 400, 401, network) are
   * shown instead of silently refreshing the queue as if it had worked.
   */
  async function postAction(url: string, body: unknown, failMessage: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        sendToLogin();
        return false;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || failMessage);
        return false;
      }
      setError(null);
      return true;
    } catch {
      setError("Can't reach the server. Nothing was changed — check the connection and try again.");
      return false;
    } finally {
      // Always refresh: a 409 usually means someone else already changed it.
      loadQueue();
    }
  }

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  usePusherEvent("staff:queue-updated", loadQueue);

  useEffect(() => {
    fetch("/api/staff/discounts")
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setDiscounts(Array.isArray(list) ? list : []))
      .catch(() => setDiscounts([]));
  }, []);

  // Shared by both the manual search box and tapping an order directly in
  // the "Awaiting Payment" list — either way opens the same
  // payment-confirmation panel (cash or GCash).
  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const term = scanValue.trim();
    setSearchTerm(term);
    setScanValue("");
  }

  function clearSearch() {
    setSearchTerm("");
  }

  function handleScanChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.replace(/\D/g, "");
    setScanValue(value);
    if (!value) setSearchTerm("");
  }

  // Opens the payment-confirmation panel for an order tapped in the
  // "Awaiting Payment" list below. Works for both CASH and GCASH orders —
  // the panel itself (below) adapts: both ask for the amount received; GCash
  // also asks for the real GCash reference number.
  function selectForPaymentConfirm(order: OrderRecord) {
    if (order.status !== "CREATED") {
      setError(`Order #${order.orderNo} is already ${order.status}.`);
      return;
    }
    setScannedOrder(order);
    // GCash: start from the total (staff correct it if the customer sent a
    // different amount). Cash: staff type what was handed over.
    setAmountReceived(order.paymentMethod === "GCASH" ? String(order.total) : "");
    setGcashRef("");
  }

  // discountId null = take the discount off. The server works out the new
  // total from the order's lines and the admin's current percentage.
  async function handleApplyDiscount(discountId: number | null) {
    if (!scannedOrder || applyingDiscount) return;
    setApplyingDiscount(true);
    try {
      const res = await fetch("/api/staff/apply-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo: scannedOrder.orderNo, discountId }),
      });
      if (res.status === 401) {
        sendToLogin();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not change the discount");
        return;
      }
      setError(null);
      setScannedOrder(data.order);
      setAmountReceived(data.order.paymentMethod === "GCASH" ? String(data.order.total) : "");
      loadQueue();
    } catch {
      setError("Can't reach the server. The discount was not changed — try again.");
    } finally {
      setApplyingDiscount(false);
    }
  }

  async function handleConfirmPayment() {
    if (!scannedOrder || confirming) return;
    const isCash = scannedOrder.paymentMethod === "CASH";

    let body: Record<string, unknown> = { orderNo: scannedOrder.orderNo };
    const amount = Number(amountReceived);
    if (!amount || toCentavos(amount) < toCentavos(scannedOrder.total)) {
      setError("Amount received must cover the total.");
      return;
    }
    body = { ...body, amountReceived: amount };
    if (!isCash) {
      if (!GCASH_REF_RE.test(gcashRef.replace(/\s+/g, ""))) {
        setError(`Enter the ${GCASH_REF_DIGITS}-digit GCash reference number.`);
        return;
      }
      body = { ...body, gcashRef: gcashRef.replace(/\s+/g, "") };
    }

    setConfirming(true);
    try {
      const res = await fetch(isCash ? "/api/staff/confirm-cash" : "/api/staff/confirm-gcash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        sendToLogin();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not confirm payment");
        return;
      }
      setScannedOrder(null);
      setAmountReceived("");
      setGcashRef("");
      setError(null);
      loadQueue();
    } catch {
      // Not knowing whether it went through matters with money: say so and
      // let staff check the queue before retrying.
      setError("Can't reach the server. Check the queue to see whether the payment went through before trying again.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancel(orderId: number) {
    await postAction("/api/staff/cancel-order", { orderId }, "Could not cancel the order.");
  }

  async function handleComplete(orderId: number) {
    await postAction("/api/staff/complete-order", { orderId }, "Could not mark the order complete.");
  }

  // Manually re-fires the kitchen ticket for an order that's already in
  // "In the Kitchen" — for a jammed printer, an empty paper roll, or a
  // ticket that got misplaced. Doesn't touch the order itself (status,
  // stock, payment are all untouched); it only asks the kitchen printer
  // bridge (src/app/print-bridge/kitchen/page.tsx) to print the same
  // ticket again. The actual print happens on a different device (the one
  // paired to the kitchen printer), so this fire-and-forgets the request —
  // "kitchen-ticket:print-result" below is how we'd hear back if it failed.
  async function handleReprintKitchen(orderNo: string) {
    const res = await fetch("/api/print-bridge/kitchen/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNo }),
    });
    if (res.status === 401) {
      sendToLogin();
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || `Could not reprint the kitchen ticket for #${orderNo}.`);
    }
  }

  usePusherEvent<{ orderNo: string; status: "printed" | "failed"; error?: string }>(
    "kitchen-ticket:print-result",
    (data) => {
      if (data.status === "failed") {
        setError(
          `Kitchen ticket for #${data.orderNo} failed to print${data.error ? `: ${data.error}` : "."} Is the kitchen printer bridge tab still open?`
        );
      }
    }
  );

  // The discount currently on the order (matched by the name saved on it).
  const appliedName = scannedOrder?.discountName ?? null;
  const isCashOrder = scannedOrder?.paymentMethod === "CASH";
  const amountNum = Number(amountReceived);
  // Compared in centavos so float noise (0.1 * 3) can't reject an exact amount.
  const totalCentavos = toCentavos(scannedOrder?.total ?? 0);
  const amountCentavos = toCentavos(amountNum);
  const cashCovered = Boolean(scannedOrder) && amountReceived !== "" && amountCentavos >= totalCentavos;
  const cashShort = Boolean(scannedOrder) && amountReceived !== "" && amountCentavos < totalCentavos;
  const change = scannedOrder && amountReceived ? fromCentavos(amountCentavos - totalCentavos) : 0;
  const gcashRefEntered = gcashRef.trim() !== "";
  const gcashRefValid = GCASH_REF_RE.test(gcashRef.replace(/\s+/g, ""));
  const gcashOverpaid = !isCashOrder && cashCovered && change > 0;

  return (
    <div className="screen bg-rice-50">
      <header className="relative flex h-[72px] items-center justify-between overflow-hidden bg-achuete-700 px-6 text-rice-50 shadow-md">
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            backgroundImage: "url(/assets/patterns/header-pattern.svg)",
            backgroundRepeat: "repeat",
            backgroundSize: "300px 169px",
          }}
          aria-hidden
        />

        <div className="relative flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <img src="/assets/brand/logo-icon.png" alt="Tapsihan" className="h-9 w-9 shrink-0" />
            <div className="-skew-x-6 leading-[0.95]">
              <div className="font-marker text-lg text-rice-50">KUY&apos;S</div>
              <div className="-mt-1 font-marker text-lg text-turmeric-500">TAPSIHAN</div>
            </div>
          </div>

          <div className="h-8 w-px bg-[#8b0000]" />

          <span className="hidden text-xs font-bold uppercase tracking-[0.2em] text-rice-50/80 sm:inline">
            Counter
          </span>
        </div>

        <div className="relative flex items-center gap-3">
          <form onSubmit={handleScanSubmit}>
            <Input
              value={scanValue}
              onChange={handleScanChange}
              placeholder="Search order #…"
              inputMode="numeric"
              className="w-56"
            />
          </form>
          <Link
            href="/staff/new-order"
            className={cn(buttonVariants({ variant: "outlineLight", size: "sm" }), "gap-1.5")}
          >
            <Plus size={16} /> New Order
          </Link>
          <AccountMenu loginPath="/login" />
        </div>
      </header>

      {error && <div className="border-b border-danger/20 bg-[#fbe4e1] p-3 text-center text-danger">{error}</div>}

      {scannedOrder && (
        <div className="m-5 overflow-hidden rounded-2xl border border-border bg-white shadow-brand">
          <div className="flex items-center justify-between bg-achuete-600 px-5 py-3 text-white">
            <h2 className="text-lg font-bold">Order #{scannedOrder.orderNo}</h2>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide">
              {scannedOrder.type === "DINE_IN" ? "Dine-in" : "Takeout"} ·{" "}
              {scannedOrder.paymentMethod === "CASH" ? "Cash" : "GCash"}
            </span>
          </div>

          <div className="flex flex-col gap-4 p-5">
            {/* Itemized order — what the customer actually ordered */}
            <div className="rounded-xl border border-border">
              <div className="border-b border-border bg-rice-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-charcoal-900/60">
                Order details
              </div>
              <ul className="divide-y divide-border">
                {scannedOrder.items.map((item) => {
                  const combo = orderItemComboContents(item);
                  return (
                    <li key={item.id} className="px-4 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">
                            {item.qty}x {orderItemName(item)}
                          </p>
                        </div>
                        <p className="whitespace-nowrap font-bold">
                          ₱{(item.unitPrice * item.qty).toFixed(0)}
                        </p>
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
                    </li>
                  );
                })}
              </ul>
              {scannedOrder.notes && (
                <p className="border-t border-border px-4 py-2 text-sm italic opacity-70">
                  Note: {scannedOrder.notes}
                </p>
              )}
            </div>

            {/* Discount — tap Senior / Student (or whatever the admin set up) */}
            {discounts.length > 0 && (
              <div className="rounded-xl border border-border">
                <div className="border-b border-border bg-rice-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-charcoal-900/60">
                  Discount
                </div>
                <div className="flex flex-wrap gap-2 p-4">
                  <button
                    type="button"
                    disabled={applyingDiscount}
                    onClick={() => appliedName !== null && handleApplyDiscount(null)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-bold transition disabled:opacity-60 ${
                      appliedName === null
                        ? "border-achuete-600 bg-achuete-600 text-white"
                        : "border-border bg-white hover:bg-rice-100"
                    }`}
                  >
                    No discount
                  </button>
                  {discounts.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={applyingDiscount}
                      onClick={() => appliedName !== d.name && handleApplyDiscount(d.id)}
                      className={`rounded-full border px-4 py-1.5 text-sm font-bold transition disabled:opacity-60 ${
                        appliedName === d.name
                          ? "border-achuete-600 bg-achuete-600 text-white"
                          : "border-border bg-white hover:bg-rice-100"
                      }`}
                    >
                      {d.name} {d.percent}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-turmeric-500/20 px-4 py-2 text-right text-lg">
              {scannedOrder.discountName && scannedOrder.subtotal != null && (
                <div className="mb-1 text-sm">
                  <div>Subtotal: ₱{scannedOrder.subtotal.toFixed(2)}</div>
                  <div className="font-bold text-emerald-700">
                    {scannedOrder.discountName} {scannedOrder.discountPercent}%: −₱{(scannedOrder.discountAmount ?? 0).toFixed(2)}
                  </div>
                </div>
              )}
              Total: <strong className="text-2xl font-extrabold">₱{scannedOrder.total.toFixed(2)}</strong>
            </div>

            {isCashOrder ? (
              <>
                <Label htmlFor="amount-received" required filled={cashCovered}>
                  Amount received (₱)
                </Label>
                <Input
                  id="amount-received"
                  type="number"
                  placeholder="Amount received"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  aria-invalid={cashShort}
                  className="text-lg"
                  autoFocus
                />
                {cashShort && (
                  <FieldError message={`Not enough — ₱${(scannedOrder.total - Number(amountReceived)).toFixed(2)} short of the total.`} />
                )}
                {cashCovered && (
                  <p className="rounded-xl bg-emerald-50 px-4 py-2 text-lg">
                    Change: <strong className="text-2xl font-extrabold text-emerald-700">₱{Math.max(change, 0).toFixed(2)}</strong>
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="rounded-xl border border-border bg-rice-50 px-4 py-3 text-sm">
                  Open the customer&apos;s GCash payment screen and check that it shows a payment to the
                  store for this order. Type the reference number and the amount it shows. Apply any
                  discount <strong>before</strong> the customer pays — a discount added afterwards lowers
                  the total below what they sent.
                </p>
                <Label htmlFor="gcash-ref" required filled={gcashRefValid}>
                  GCash reference no.
                </Label>
                <Input
                  id="gcash-ref"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={`${GCASH_REF_DIGITS} digits, e.g. 1234 567 890123`}
                  value={gcashRef}
                  onChange={(e) => setGcashRef(e.target.value.replace(/[^\d\s]/g, ""))}
                  aria-invalid={gcashRefEntered && !gcashRefValid}
                  className="text-lg"
                  autoFocus
                />
                {gcashRefEntered && !gcashRefValid && (
                  <FieldError message={`Must be ${GCASH_REF_DIGITS} digits (spaces are fine).`} />
                )}
                <Label htmlFor="amount-received" required filled={cashCovered}>
                  Amount received (₱)
                </Label>
                <Input
                  id="amount-received"
                  type="number"
                  inputMode="decimal"
                  placeholder="Amount shown on the customer's screen"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  aria-invalid={cashShort}
                  className="text-lg"
                />
                {cashShort && (
                  <FieldError message={`Not enough — ₱${(scannedOrder.total - amountNum).toFixed(2)} short of the total.`} />
                )}
                {gcashOverpaid && (
                  <p className="rounded-xl bg-turmeric-500/20 px-4 py-2 text-sm font-semibold">
                    The customer sent ₱{change.toFixed(2)} more than the total — give it back or note it before confirming.
                  </p>
                )}
              </>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleConfirmPayment}
                disabled={confirming || !cashCovered || (!isCashOrder && !gcashRefValid)}
              >
                {confirming ? "Confirming…" : "Confirm Paid — Send to Kitchen"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setScannedOrder(null);
                  setAmountReceived("");
                  setGcashRef("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
            {!cashCovered && !cashShort && (
              <p className="text-xs font-semibold text-danger">Enter the amount received to enable Confirm.</p>
            )}
            <p className="text-sm opacity-60">
              {isCashOrder
                ? "Once confirmed, this order is sent to the kitchen automatically — no extra step needed. Hand the printed receipt back to the customer as their pickup stub; when the kitchen hands you the matching food, give it to them and tap \u201CPicked Up\u201D once they actually take it."
                : "Once confirmed, this order is sent to the kitchen automatically and a receipt prints for the customer's pickup stub. When the kitchen hands you the matching food, give it to the customer and tap \u201CPicked Up\u201D once they actually take it."}
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5">
        <OrderQueue
          orders={queue}
          searchTerm={searchTerm}
          onClearSearch={clearSearch}
          onSelectAwaiting={selectForPaymentConfirm}
          onCancel={handleCancel}
          onComplete={handleComplete}
          onReprintKitchen={handleReprintKitchen}
        />
      </div>
    </div>
  );
}
