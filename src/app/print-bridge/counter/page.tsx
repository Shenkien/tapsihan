"use client";

import { useEffect, useRef, useState } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import { ORDERS_CHANNEL } from "@/lib/pusher-channels";
import { printThermalReceiptSilent } from "@/lib/printThermalRawBT";
import { printKitchenTicketSilent } from "@/lib/printKitchenTicketRawBT";
import { bridgeHeaders, getBridgeKey } from "@/lib/bridgeKey";
import { createPrintQueue } from "@/lib/printQueue";
import { receiptStation, type ReceiptVariant } from "@/lib/printRouting";
import type { OrderRecord } from "@/types/models";

/**
 * COUNTER + KITCHEN print bridge — leave this page open in Chrome on the
 * Android phone that is paired (Bluetooth, via RawBT) to the printer the
 * counter and the kitchen SHARE.
 *
 * It replaces running /print-bridge/kitchen for that printer, and adds what no
 * RawBT page printed before: receipts for orders staff type in at the counter.
 * It prints, on this one printer:
 *   - kitchen tickets       the moment payment is confirmed (and on a staff
 *                           "Reprint Kitchen Ticket")
 *   - counter receipts      the full receipt for an order staff entered at the
 *                           counter (New Order), at the moment it is created
 *   - paid receipts         for KIOSK orders, when staff confirm payment (the
 *                           customer is at the counter by then, not the kiosk)
 * Which receipt goes to which printer is decided in lib/printRouting.ts.
 *
 * Other devices in this layout:
 *   - the KIOSK printer's phone keeps /print-bridge (kiosk receipts at order time)
 *   - the staff PC prints nothing itself: it asks this phone, through the server
 *
 * DON'T open /print-bridge/kitchen on any device paired to the same printer as
 * this page, or every kitchen ticket prints twice. Use /kitchen only if the
 * kitchen has its OWN printer, and then don't run this page there.
 *
 * WHY A QUEUE: payment confirmation asks for a kitchen ticket and a paid
 * receipt at the same instant, and each RawBT job is started by navigating to a
 * rawbt: link; a second navigation would replace the first and one paper would
 * be lost. Jobs therefore run one at a time with a pause between them
 * (lib/printQueue.ts).
 *
 * Same ack + retry behaviour as the other bridge pages, and the same one-time
 * setup: RawBT installed and paired, "Always open" on the first rawbt: prompt,
 * the bridge key saved once (open this page with ?key=YOUR_KEY), screen kept
 * awake, Chrome and RawBT exempt from battery saving.
 */

// Long enough for RawBT to open and start a job before the next one is handed
// over; short enough that two papers still come out within a few seconds.
const GAP_MS = 2500;
const MAX_PRINT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500; // multiplied by attempt number — 1.5s, then 3s
const IDLE = "Waiting for orders…";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function postAck(url: string, payload: Record<string, unknown>) {
  // Best-effort: a lost ack leaves the requester's own timeout to cover it, and
  // never un-prints the paper.
  fetch(url, { method: "POST", headers: bridgeHeaders(), body: JSON.stringify(payload) })
    .then((res) => {
      if (res.status === 401) console.error("Print ack rejected (401): missing or wrong bridge key on this device.");
    })
    .catch((err) => console.error("Failed to send print ack (ignored):", err));
}

async function fetchOrder(orderNo: string): Promise<{ order: OrderRecord; barcodeImage: string | null }> {
  const res = await fetch(`/api/orders/${orderNo}`);
  const body = (await res.json().catch(() => null)) as { order: OrderRecord; barcodeImage: string | null } | null;
  if (!res.ok || !body) throw new Error("Order not found");
  return body;
}

export default function CounterPrintBridgePage() {
  const [status, setStatus] = useState(IDLE);
  const [lastError, setLastError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const queueRef = useRef(createPrintQueue(GAP_MS));
  // Stops Pusher redelivering the same event (or a reconnect replaying it)
  // from printing twice. Cleared 10 s after a success so a deliberate reprint
  // still goes through.
  const seenRef = useRef<Set<string>>(new Set());

  // The ack routes need PRINT_BRIDGE_KEY (lib/bridge-auth.ts). Printing works
  // without it, but nobody would hear back, so say so instead of failing quietly.
  useEffect(() => {
    if (!getBridgeKey() && process.env.NODE_ENV === "production") {
      setLastError(
        "No bridge key saved on this device, so print results can't reach the staff screen. Open this page once with ?key=YOUR_KEY on the end of the address."
      );
    }
  }, []);

  useEffect(() => {
    const client = getPusherClient();
    if (!client) {
      setStatus("Realtime unavailable — check NEXT_PUBLIC_PUSHER_KEY");
      return;
    }
    const queue = queueRef.current;
    const seen = seenRef.current;
    const channel = client.subscribe(ORDERS_CHANNEL);

    /** Runs `attempt` up to MAX_PRINT_ATTEMPTS times; returns null on success or the last error message. */
    async function withRetries(label: string, attempt: () => Promise<"done" | "skipped">) {
      let lastErrMessage = "Unknown error";
      for (let n = 1; n <= MAX_PRINT_ATTEMPTS; n++) {
        setStatus(n === 1 ? `Printing ${label}…` : `Printing ${label}… (attempt ${n}/${MAX_PRINT_ATTEMPTS})`);
        try {
          return { result: await attempt(), error: null };
        } catch (err) {
          lastErrMessage = err instanceof Error ? err.message : "Unknown error";
          if (n < MAX_PRINT_ATTEMPTS) await wait(n * RETRY_DELAY_MS);
        }
      }
      return { result: null, error: lastErrMessage };
    }

    function enqueue(job: () => Promise<void>) {
      queue
        .enqueue(job)
        .catch((err) => console.error("Print job failed:", err))
        .finally(() => setQueued(queue.size));
      setQueued(queue.size);
    }

    // ---- customer receipts ------------------------------------------------
    const onReceipt = (data: { orderNo: string; variant: ReceiptVariant }) => {
      const key = `receipt:${data.orderNo}:${data.variant}`;
      if (seen.has(key)) return;
      seen.add(key);
      setLastError(null);

      enqueue(async () => {
        const { result, error } = await withRetries(`receipt for order ${data.orderNo}`, async () => {
          const { order, barcodeImage } = await fetchOrder(data.orderNo);
          // Not ours (the kiosk printer's phone, or nobody, prints this one):
          // skip silently and don't ack, so the right bridge's ack is the one heard.
          if (receiptStation(order.source, data.variant) !== "counter") return "skipped";
          await printThermalReceiptSilent(order, { barcodeImage, variant: data.variant });
          return "done";
        });
        setStatus(IDLE);
        if (result === "skipped") {
          seen.delete(key);
        } else if (result === "done") {
          postAck("/api/print-bridge/ack", { orderNo: data.orderNo, variant: data.variant, status: "printed" });
          setTimeout(() => seen.delete(key), 10000);
        } else {
          seen.delete(key);
          setLastError(`Failed to print receipt for order ${data.orderNo} after ${MAX_PRINT_ATTEMPTS} attempts: ${error}`);
          postAck("/api/print-bridge/ack", { orderNo: data.orderNo, variant: data.variant, status: "failed", error });
        }
      });
    };

    // ---- kitchen tickets --------------------------------------------------
    const onKitchen = (data: { orderNo: string }) => {
      const key = `kitchen:${data.orderNo}`;
      if (seen.has(key)) return;
      seen.add(key);
      setLastError(null);

      enqueue(async () => {
        const { result, error } = await withRetries(`kitchen ticket for order ${data.orderNo}`, async () => {
          const { order } = await fetchOrder(data.orderNo);
          printKitchenTicketSilent(order);
          return "done";
        });
        setStatus(IDLE);
        if (result === "done") {
          postAck("/api/print-bridge/kitchen/ack", { orderNo: data.orderNo, status: "printed" });
          setTimeout(() => seen.delete(key), 10000);
        } else {
          seen.delete(key);
          setLastError(`Failed to print kitchen ticket for order ${data.orderNo} after ${MAX_PRINT_ATTEMPTS} attempts: ${error}`);
          postAck("/api/print-bridge/kitchen/ack", { orderNo: data.orderNo, status: "failed", error });
        }
      });
    };

    channel.bind("receipt:print-requested", onReceipt);
    channel.bind("kitchen-ticket:print-requested", onKitchen);
    return () => {
      channel.unbind("receipt:print-requested", onReceipt);
      channel.unbind("kitchen-ticket:print-requested", onKitchen);
      client.unsubscribe(ORDERS_CHANNEL);
    };
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "monospace", fontSize: 18, lineHeight: 1.6 }}>
      <p>Counter + kitchen print bridge — leave this page open on the phone paired to the COUNTER/KITCHEN printer.</p>
      <p>Status: {status}</p>
      {queued > 1 && <p>Waiting in line: {queued - 1}</p>}
      {lastError && <p style={{ color: "#b91c1c" }}>{lastError}</p>}
    </div>
  );
}
