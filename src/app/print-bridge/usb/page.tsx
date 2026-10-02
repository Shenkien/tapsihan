"use client";

import { useEffect, useRef, useState } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import { ORDERS_CHANNEL } from "@/lib/pusher-channels";
import { buildKioskReceiptHtml, printThermalReceipt } from "@/lib/printReceipt";
import { bridgeHeaders, getBridgeKey } from "@/lib/bridgeKey";
import type { OrderRecord } from "@/types/models";

/**
 * Print bridge — meant to stay open in Chrome on the STAFF DESKTOP that has
 * a thermal receipt printer plugged in over USB (replacing the counter
 * phone from print-bridge/page.tsx; the kitchen phone/RawBT setup is
 * untouched).
 *
 * WHY THIS EXISTS AS A SEPARATE PAGE: print-bridge/page.tsx hands every job
 * to RawBT via the `rawbt:` URI scheme, which only exists on Android. This
 * desktop has no RawBT — instead, once the printer's Windows driver is
 * installed it shows up as a normal system printer, and Chrome can print to
 * it directly via window.print() (see printReceipt.ts). This page is the
 * desktop equivalent of print-bridge/page.tsx: same event, same ack/retry
 * behavior, different printing mechanism underneath.
 *
 * WHAT TRIGGERS A PRINT HERE: staff confirming a cash payment, or a GCash
 * payment clearing, fires "receipt:print-requested" with variant "paid"
 * (see confirm-cash/route.ts and paymentFlow.ts) -> prints the FULL receipt
 * for a COUNTER order, including cash received and change. Nothing prints
 * when a staff-entered order is first created; the "cash-pending" /
 * "gcash-pending" events are ignored here.
 * The event broadcasts on the same Pusher "orders" channel this page listens on.
 *
 * SOURCE FILTERING: the SAME event also fires for KIOSK orders, which the
 * phone/RawBT bridge at print-bridge/page.tsx handles. The event payload
 * carries no source field, so this page fetches the order and only prints
 * when it's a COUNTER order, silently skipping anything else so the kiosk
 * bridge's own attempt is the one that acks it.
 *
 * ONE-TIME SETUP ON THIS DESKTOP:
 *   1. Plug in the printer via USB and install its Windows driver — it
 *      will show up as a normal printer in Windows' printer list.
 *   2. Set it as the DEFAULT printer (Windows Settings > Printers & Scanners).
 *   3. Launch Chrome with the `--kiosk-printing` flag pointed at this page,
 *      e.g. a shortcut with target:
 *        chrome.exe --kiosk-printing --app=https://your-site/print-bridge/usb
 *      That flag makes window.print() go straight to the default printer
 *      with no dialog. Without it, this page still works, it'll just pop
 *      the normal print dialog for every order.
 *   4. Leave that window open and the screen awake — closing it (or the PC
 *      sleeping) stops this printer from receiving anything, same caveat
 *      as the phone bridges.
 */
function postAck(payload: {
  orderNo: string;
  variant: "cash-pending" | "gcash-pending" | "paid";
  status: "printed" | "failed";
  error?: string;
}) {
  // Best-effort — if this fails there's nothing more useful to do than log
  // it; the requester's own wait-for-ack timeout is the backstop for that case.
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

export default function PrintBridgeUsbPage() {
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
  // reconnect replays it) while this tab is open. Resets on page reload.
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
          // This event also fires for KIOSK orders, which the kiosk phone
          // bridge (print-bridge/page.tsx) handles — skip anything that
          // isn't ours so it doesn't double-print, and let that bridge's
          // own attempt send the ack for it.
          if (body.order.source !== "COUNTER") {
            seenRef.current.delete(key);
            return;
          }
          // Counter orders print nothing when entered (pending variants);
          // the full receipt, with cash received + change, prints once
          // staff confirm payment ("paid").
          if (data.variant !== "paid") {
            seenRef.current.delete(key);
            return;
          }
          const html = await buildKioskReceiptHtml(body.order, { barcodeImage: body.barcodeImage, variant: "paid" });
          printThermalReceipt(html);
          setStatus("Waiting for orders…");
          postAck({ orderNo: data.orderNo, variant: data.variant, status: "printed" });
          // Only guard against a near-instant redelivery of this exact
          // event (a Pusher reconnect replay) — a deliberate "Reprint
          // receipt" tap later on is a brand new request for the same
          // orderNo+variant and must still go through.
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
      <p>USB print bridge — leave this window open on the desktop with the counter printer.</p>
      <p>Status: {status}</p>
      {lastError && <p style={{ color: "#b91c1c" }}>{lastError}</p>}
    </div>
  );
}
