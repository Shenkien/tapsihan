"use client";

import { useEffect, useRef, useState } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import { ORDERS_CHANNEL } from "@/lib/pusher-channels";
import { printThermalReceiptSilent } from "@/lib/printThermalRawBT";
import { bridgeHeaders, getBridgeKey } from "@/lib/bridgeKey";
import { receiptStation } from "@/lib/printRouting";
import type { OrderRecord } from "@/types/models";

/**
 * Print bridge — meant to stay open in Chrome on the one Android phone
 * that's paired with the PT-210 over Bluetooth (via RawBT).
 *
 * The iPad kiosk has no Bluetooth connection to the printer at all, so
 * instead of printing locally it POSTs to /api/print-bridge/request, which
 * broadcasts a "receipt:print-requested" event on the same Pusher "orders"
 * channel the rest of the app already uses for live order updates. This
 * page is the other end of that: it listens for the event, fetches the
 * order + barcode image, and hands them to printThermalReceiptSilent — the
 * exact same function the Android kiosk tablets call directly, so a
 * printed receipt looks identical no matter which device triggered it.
 *
 * Leave this tab open and the screen awake. If Chrome ever shows a one-time
 * "Open with RawBT?" prompt, check "Always open" — same note as in
 * printThermalRawBT.ts.
 *
 * ACK + RETRY: the requester (OrderFlow.tsx, on behalf of the iPad kiosk)
 * has no way to know whether a print actually happened once it POSTs to
 * /api/print-bridge/request — it used to just assume success. This page now
 * reports back what happened by POSTing to /api/print-bridge/ack, which
 * broadcasts a "receipt:print-result" event the kiosk listens for. It also
 * retries a few times on its own before giving up and reporting failure,
 * since most failures here are a momentary network blip fetching the order,
 * not something actually wrong with the order.
 */
function postAck(payload: {
  orderNo: string;
  variant: "cash-pending" | "gcash-pending" | "paid";
  status: "printed" | "failed";
  error?: string;
}) {
  // Best-effort — if this fails there's nothing more useful to do than log
  // it; the kiosk's own wait-for-ack timeout is the backstop for that case.
  fetch("/api/print-bridge/ack", {
    method: "POST",
    headers: bridgeHeaders(),
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (res.status === 401) console.error("Print ack rejected (401): missing or wrong bridge key on this device.");
    })
    .catch((err) => console.error("Failed to send print ack (ignored):", err));
}

const MAX_PRINT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500; // multiplied by attempt number — 1.5s, then 3s

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PrintBridgePage() {
  const [status, setStatus] = useState("Waiting for orders…");
  const [lastError, setLastError] = useState<string | null>(null);
  // The ack routes need PRINT_BRIDGE_KEY (see lib/bridge-auth.ts). Printing
  // itself still works without it, but the kiosk would never hear back — so
  // say so on the screen instead of failing silently.
  useEffect(() => {
    if (!getBridgeKey() && process.env.NODE_ENV === "production") {
      setLastError(
        "No bridge key saved on this device, so print results can't reach the kiosk. Open this page once with ?key=YOUR_KEY on the end of the address."
      );
    }
  }, []);
  // Prevents a duplicate print if Pusher redelivers the same event (or a
  // reconnect replays it) while this tab is open. Resets on page reload —
  // a reload right after a request could in theory cause one duplicate
  // print, which is an acceptable tradeoff for keeping this simple.
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const client = getPusherClient();
    if (!client) {
      setStatus("Realtime unavailable — check NEXT_PUBLIC_PUSHER_KEY");
      return;
    }

    const channel = client.subscribe(ORDERS_CHANNEL);

    const handler = async (data: { orderNo: string; variant: "cash-pending" | "gcash-pending" | "paid" }) => {
      const key = `${data.orderNo}:${data.variant}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);

      setLastError(null);

      let lastErrMessage = "Unknown error";
      for (let attempt = 1; attempt <= MAX_PRINT_ATTEMPTS; attempt++) {
        setStatus(
          attempt === 1
            ? `Printing order ${data.orderNo}…`
            : `Printing order ${data.orderNo}… (attempt ${attempt}/${MAX_PRINT_ATTEMPTS})`
        );
        try {
          const res = await fetch(`/api/orders/${data.orderNo}`);
          const body: { order: OrderRecord; barcodeImage: string } = await res.json();
          if (!res.ok) throw new Error("Order not found");
          // This event fires for BOTH the kiosk (this page) and the counter
          // (print-bridge/usb, a separate USB-connected printer) — the
          // event itself carries no source, so each bridge has to check the
          // fetched order and only handle its own. Skip silently (no print,
          // no ack) so the other bridge's own attempt is the one that acks.
          // Two-printer layout: this page is the KIOSK printer. It prints the
          // receipt a kiosk customer takes away at order time. The "paid"
          // receipt (and everything for staff-entered orders) belongs to the
          // counter printer, so skip it here without acking - the counter
          // bridge (print-bridge/counter) is the one that handles and acks it.
          if (receiptStation(body.order.source, data.variant) !== "kiosk") {
            seenRef.current.delete(key);
            return;
          }
          await printThermalReceiptSilent(body.order, { barcodeImage: body.barcodeImage, variant: data.variant });
          setStatus("Waiting for orders…");
          postAck({ orderNo: data.orderNo, variant: data.variant, status: "printed" });
          // Only guard against a near-instant redelivery of this exact
          // event (a Pusher reconnect replay) — a deliberate "Reprint
          // receipt" tap later on is a brand new request for the same
          // orderNo+variant and must still go through, so this key can't
          // be left in the set forever the way it was before.
          setTimeout(() => seenRef.current.delete(key), 10000);
          return;
        } catch (err) {
          lastErrMessage = err instanceof Error ? err.message : "Unknown error";
          if (attempt < MAX_PRINT_ATTEMPTS) await wait(attempt * RETRY_DELAY_MS);
        }
      }

      // Every attempt failed. Drop the dedupe key so a Pusher reconnect
      // replay (or a manual re-trigger) can still try again later, and tell
      // the requester so it stops assuming this printed.
      seenRef.current.delete(key);
      setLastError(
        `Failed to print order ${data.orderNo} after ${MAX_PRINT_ATTEMPTS} attempts: ${lastErrMessage}`
      );
      setStatus("Waiting for orders…");
      postAck({ orderNo: data.orderNo, variant: data.variant, status: "failed", error: lastErrMessage });
    };

    channel.bind("receipt:print-requested", handler);

    return () => {
      channel.unbind("receipt:print-requested", handler);
      client.unsubscribe(ORDERS_CHANNEL);
    };
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "monospace", fontSize: 18, lineHeight: 1.6 }}>
      <p>Print bridge — leave this page open on the phone paired to the PT-210.</p>
      <p>Status: {status}</p>
      {lastError && <p style={{ color: "#b91c1c" }}>{lastError}</p>}
    </div>
  );
}
