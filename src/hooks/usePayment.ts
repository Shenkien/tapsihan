"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePusherEvent } from "@/hooks/usePusherEvent";
import type { CartItem, OrderRecord, OrderSource, OrderType, PaymentMethod } from "@/types/models";

type SubmitOrderArgs = {
  type: OrderType;
  source: OrderSource;
  paymentMethod: PaymentMethod;
  items: CartItem[];
  notes?: string;
};

type OrderResponse = {
  order: OrderRecord;
  barcodeImage: string | null;
  qrImage: string | null;
  /** Secret for cancelling this order while unpaid; only sent when the order is created. */
  cancelToken?: string | null;
};

/**
 * Manages the post-checkout lifecycle of a single order: submitting it,
 * watching for payment confirmation by staff (via Pusher, with polling as a
 * fallback), and exposing a "simulate paid" action for local testing.
 */
// Poll every 3 s, back off after errors (up to 30 s), and give up after 20
// minutes: the server cancels unpaid orders after 30 minutes anyway, and an
// abandoned tab shouldn't poll forever.
const POLL_MS = 3000;
const POLL_MAX_BACKOFF_MS = 30_000;
const POLL_GIVE_UP_MS = 20 * 60 * 1000;

/** Reads a JSON body without throwing when the server sent HTML (a platform 500/413 page). */
async function readJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// crypto.randomUUID only exists on HTTPS/localhost; a kiosk served over plain
// HTTP on the store network needs the fallback.
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function usePayment() {
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [barcodeImage, setBarcodeImage] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  // Kept in memory only (never stored or shown): it lets this screen cancel
  // its own unpaid order.
  const [cancelToken, setCancelToken] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "waiting" | "created" | "paid" | "cancelled" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  // One Idempotency-Key per cart: if a submit fails after the server already
  // saved the order (timeout, dropped connection) and the customer taps again
  // with the same cart, the server returns the saved order instead of
  // creating a second one. Cleared once a submit succeeds.
  const idemRef = useRef<{ payload: string; key: string } | null>(null);

  const submitOrder = useCallback(async ({ type, source, paymentMethod, items, notes }: SubmitOrderArgs) => {
    setStatus("submitting");
    setError(null);
    try {
      const payload = {
        type,
        source,
        paymentMethod,
        notes: notes || undefined,
        items: items.map((i) => ({
          ...(i.product.isCombo ? { comboMealId: i.product.id } : { productId: i.product.id }),
          qty: i.qty,
          notes: i.notes || undefined,
        })),
      };
      const body = JSON.stringify(payload);
      if (!idemRef.current || idemRef.current.payload !== body) {
        idemRef.current = { payload: body, key: newIdempotencyKey() };
      }
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idemRef.current.key },
        body,
      });
      // Check res.ok before trusting the body: a platform error page is HTML,
      // and res.json() on it surfaces as "Unexpected token <".
      const data = await readJsonSafe<OrderResponse & { error?: string }>(res);
      if (!res.ok || !data) throw new Error(data?.error || "Could not submit order. Please try again.");
      idemRef.current = null;

      setOrder(data.order);
      setBarcodeImage(data.barcodeImage);
      setQrImage(data.qrImage);
      setCancelToken(data.cancelToken ?? null);
      setStatus(paymentMethod === "GCASH" ? "waiting" : "created");
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit order");
      setStatus("error");
      throw err;
    }
  }, []);

  // Live update via Pusher.
  usePusherEvent<{ orderNo: string }>("order:paid", (payload) => {
    if (order && payload.orderNo === order.orderNo) setStatus("paid");
  });

  // Poll order status as a fallback in case the Pusher event is missed.
  // Covers "waiting" (GCash, watching for staff to confirm it) and "created" (cash, watching
  // for staff to confirm at the counter) — the QR digital receipt needs to
  // flip to "Paid" on its own for both payment methods, same as a kiosk
  // ticket updating without anyone touching the tablet.
  useEffect(() => {
    if ((status !== "waiting" && status !== "created") || !order) return undefined;

    const orderNo = order.orderNo;
    const startedAt = Date.now();
    let failures = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      if (Date.now() - startedAt > POLL_GIVE_UP_MS) return; // stop quietly; Pusher can still update us
      let next = POLL_MS;
      try {
        // Status only — no barcode rendering on the server for every poll.
        const res = await fetch(`/api/orders/${orderNo}/status`, { cache: "no-store" });
        const data = await readJsonSafe<{ status?: string }>(res);
        if (!res.ok || !data?.status) throw new Error("status poll failed");
        failures = 0;
        // Leaving CREATED means either staff confirmed payment (-> PAID) or
        // staff cancelled the order (-> CANCELLED). Those aren't the same
        // thing to the customer, so this can't just collapse to "paid" the
        // moment status stops being CREATED the way it used to — that quietly
        // told a customer with a cancelled order that payment was received.
        if (data.status === "CANCELLED") {
          setStatus("cancelled");
          return;
        }
        if (data.status !== "CREATED") {
          setStatus("paid");
          return;
        }
      } catch {
        failures++;
        next = Math.min(POLL_MAX_BACKOFF_MS, POLL_MS * 2 ** Math.min(failures, 4));
      }
      if (!stopped) timer = setTimeout(tick, next);
    };
    timer = setTimeout(tick, POLL_MS);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [status, order]);

  // Local-dev only: a stand-in for "staff confirmed the GCash payment". In
  // production staff confirm GCash manually against the static QR, so without
  // this flag every real customer would see a button that lets them mark
  // their own order paid. See .env for the flag.
  const canSimulateGcashPaid = process.env.NEXT_PUBLIC_ALLOW_PAYMENT_SIMULATION === "true";

  const simulateGcashPaid = useCallback(async () => {
    if (!order || !canSimulateGcashPaid) return;
    await fetch("/api/dev/simulate-gcash-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNo: order.orderNo }),
    });
  }, [order, canSimulateGcashPaid]);

  /**
   * Cancels this order (only works while it is unpaid). Resolves to an error
   * message to show the customer, or null when it worked.
   */
  const cancelOrder = useCallback(async (): Promise<string | null> => {
    if (!order || !cancelToken) return "This order can't be cancelled from here. Please ask the counter.";
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${order.orderNo}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cancelToken }),
      });
      const data = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) return data?.error || "Couldn't cancel. Please ask the counter.";
      setStatus("cancelled");
      return null;
    } catch {
      return "Couldn't reach the server. Your order is still saved. Please ask the counter.";
    } finally {
      setCancelling(false);
    }
  }, [order, cancelToken]);

  const reset = useCallback(() => {
    setOrder(null);
    setBarcodeImage(null);
    setQrImage(null);
    setCancelToken(null);
    setCancelling(false);
    setStatus("idle");
    setError(null);
  }, []);

  return {
    order,
    barcodeImage,
    qrImage,
    status,
    error,
    submitOrder,
    cancelOrder,
    cancelling,
    canCancel: cancelToken !== null && (status === "waiting" || status === "created"),
    simulateGcashPaid,
    canSimulateGcashPaid,
    reset,
  };
}
