"use client";

import { useEffect, useRef } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import { ORDERS_CHANNEL } from "@/lib/pusher-channels";

/**
 * Subscribes to a single event on the shared "orders" Pusher channel for the
 * lifetime of the component. Mirrors the old `socket.on(event, cb)` /
 * `socket.off(event, cb)` pattern from the Socket.IO version. The channel
 * subscription itself is left open (Pusher's subscribe is idempotent and the
 * app only ever uses this one low-traffic channel), so we only bind/unbind
 * this component's own callback.
 *
 * THE STALE-CLOSURE BUG THIS FIXES: the effect's dependency list was `[event]`
 * with `react-hooks/exhaustive-deps` disabled, so the *first* render's
 * `callback` was bound to the channel and never replaced. Callers pass an
 * inline arrow that closes over state, and that state is captured at mount:
 *
 *     // usePayment.ts — `order` is null on the first render
 *     usePusherEvent("order:paid", (p) => {
 *       if (order && p.orderNo === order.orderNo) setStatus("paid");
 *     });
 *
 * The bound function therefore saw `order === null` forever, and the guard
 * could never pass — so the QR receipt's realtime "Paid" flip never actually
 * worked. It only looked like it did because usePayment also polls
 * /api/orders/:orderNo every 3 seconds as a "fallback"; the fallback was
 * carrying the whole feature, up to 3 seconds late.
 *
 * Re-running the effect on every render instead would unsubscribe and
 * resubscribe constantly, so the callback lives in a ref that each render
 * refreshes, and a stable wrapper is what gets bound.
 */
export function usePusherEvent<T = unknown>(event: string, callback: (data: T) => void) {
  const callbackRef = useRef(callback);

  // Kept in sync on every render, so the bound handler below always reaches
  // the latest closure without rebinding.
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return undefined;

    const channel = pusher.subscribe(ORDERS_CHANNEL);
    const handler = (data: T) => callbackRef.current(data);
    channel.bind(event, handler);

    return () => {
      channel.unbind(event, handler);
    };
  }, [event]);
}
