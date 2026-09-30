"use client";

import { useEffect, useRef, useState } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import { ORDERS_CHANNEL } from "@/lib/pusher-channels";
import { printKitchenTicketSilent } from "@/lib/printKitchenTicketRawBT";
import { bridgeHeaders, getBridgeKey } from "@/lib/bridgeKey";
import type { OrderRecord } from "@/types/models";

/**
 * Kitchen print bridge — the kitchen's OWN copy of src/app/print-bridge
 * (which handles the customer receipt printer). Leave THIS page open in
 * Chrome on whichever device is paired, over Bluetooth via RawBT, to the
 * SECOND thermal printer — the one that sits in/near the kitchen, not the
 * one at the counter.
 *
 * WHY A SEPARATE PAGE INSTEAD OF REUSING /print-bridge: RawBT always
 * prints on whichever printer is currently selected inside the RawBT app
 * on THAT device. One device can only be paired to one printer at a time,
 * so the counter receipt and the kitchen ticket need two different devices
 * each running their own bridge page — this one only ever builds and
 * sends KITCHEN tickets (see printKitchenTicketRawBT.ts for why that's a
 * different document from the customer receipt), so there's no risk of it
 * accidentally printing a customer receipt on the kitchen printer or vice
 * versa.
 *
 * WHEN THIS FIRES: automatically, the moment an order is marked PAID
 * (either staff confirming cash, or a GCash payment coming in) — see the
 * "kitchen-ticket:print-requested" notify() calls in
 * POST /api/staff/confirm-cash, confirm-gcash and markOrderPaid (paymentFlow.ts).
 * There's no manual "send to kitchen" step; the kitchen ticket prints on
 * its own the instant payment clears. Staff can also manually re-trigger
 * this (e.g. the ticket jammed or got lost) via the "Reprint Kitchen
 * Ticket" button on an in-kitchen order card in StaffScreen.tsx, which
 * hits /api/print-bridge/kitchen/request the same way.
 *
 * Same ACK + RETRY behavior as the receipt bridge: reports back what
 * happened via /api/print-bridge/kitchen/ack so a manual reprint request
 * gets a real success/failure instead of assuming it worked, and retries a
 * few times on its own before giving up (most failures here are a
 * momentary network blip fetching the order, not something wrong with the
 * order itself).
 */
function postAck(payload: { orderNo: string; status: "printed" | "failed"; error?: string }) {
  // Best-effort — if this fails there's nothing more useful to do than log
  // it; a manual reprint request that never gets acked just leaves the
  // Staff screen's toast unresolved, not the ticket unprinted.
  fetch("/api/print-bridge/kitchen/ack", {
    method: "POST",
    headers: bridgeHeaders(),
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (res.status === 401) console.error("Print ack rejected (401): missing or wrong bridge key on this device.");
    })
    .catch((err) => console.error("Failed to send kitchen print ack (ignored):", err));
}

const MAX_PRINT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500; // multiplied by attempt number — 1.5s, then 3s

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function KitchenPrintBridgePage() {
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
  // see the receipt bridge's identical note for why that tradeoff is fine.
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const client = getPusherClient();
    if (!client) {
      setStatus("Realtime unavailable — check NEXT_PUBLIC_PUSHER_KEY");
      return;
    }

    const channel = client.subscribe(ORDERS_CHANNEL);

    const handler = async (data: { orderNo: string }) => {
      // Keyed on orderNo alone (unlike the receipt bridge's orderNo+variant)
      // — a kitchen ticket only ever has one version, there's no
      // cash-pending/paid split the way the customer receipt has.
      const key = data.orderNo;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);

      setLastError(null);

      let lastErrMessage = "Unknown error";
      for (let attempt = 1; attempt <= MAX_PRINT_ATTEMPTS; attempt++) {
        setStatus(
          attempt === 1
            ? `Printing kitchen ticket for order ${data.orderNo}…`
            : `Printing kitchen ticket for order ${data.orderNo}… (attempt ${attempt}/${MAX_PRINT_ATTEMPTS})`
        );
        try {
          const res = await fetch(`/api/orders/${data.orderNo}`);
          const body: { order: OrderRecord } = await res.json();
          if (!res.ok) throw new Error("Order not found");
          printKitchenTicketSilent(body.order);
          setStatus("Waiting for orders…");
          postAck({ orderNo: data.orderNo, status: "printed" });
          // Only guard against a near-instant redelivery of this exact
          // event (a Pusher reconnect replay) — a deliberate reprint tap
          // later on is a brand new request for the same orderNo and must
          // still go through, so this key can't be left in the set forever.
          setTimeout(() => seenRef.current.delete(key), 10000);
          return;
        } catch (err) {
          lastErrMessage = err instanceof Error ? err.message : "Unknown error";
          if (attempt < MAX_PRINT_ATTEMPTS) await wait(attempt * RETRY_DELAY_MS);
        }
      }

      // Every attempt failed. Drop the dedupe key so a Pusher reconnect
      // replay (or a manual reprint tap) can still try again later, and
      // tell whoever's waiting so it stops assuming this printed.
      seenRef.current.delete(key);
      setLastError(
        `Failed to print kitchen ticket for order ${data.orderNo} after ${MAX_PRINT_ATTEMPTS} attempts: ${lastErrMessage}`
      );
      setStatus("Waiting for orders…");
      postAck({ orderNo: data.orderNo, status: "failed", error: lastErrMessage });
    };

    channel.bind("kitchen-ticket:print-requested", handler);

    return () => {
      channel.unbind("kitchen-ticket:print-requested", handler);
      client.unsubscribe(ORDERS_CHANNEL);
    };
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "monospace", fontSize: 18, lineHeight: 1.6 }}>
      <p>Kitchen print bridge — leave this page open on the device paired to the KITCHEN printer.</p>
      <p>Status: {status}</p>
      {lastError && <p style={{ color: "#b91c1c" }}>{lastError}</p>}
    </div>
  );
}
