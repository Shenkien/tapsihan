import PusherServer from "pusher";

/**
 * Server-side Pusher client. Replaces the old Socket.IO server — instead of
 * `io.emit(event, payload)`, routes call `notify(event, payload)`.
 *
 * All real-time updates for this app go on a single public channel, "orders":
 *   - "order:paid"          — a GCash order was marked paid
 *   - "staff:queue-updated" — the staff counter queue should refetch.
 *                             Fired on order creation (a new order landing
 *                             in "Awaiting Payment") and on every action
 *                             that moves an order along after that
 *                             (confirm-cash, confirm-gcash, cancel,
 *                             complete) — an already-open /staff tab stays
 *                             live without a manual reload.
 *   - "kitchen-ticket:print-requested" / "kitchen-ticket:print-result" —
 *                             the kitchen's SECOND thermal printer bridge.
 *                             Fired the instant an order (cash or GCash)
 *                             is marked PAID, and again on-demand from
 *                             StaffScreen.tsx's "Reprint Kitchen Ticket"
 *                             button. See printKitchenTicketRawBT.ts and
 *                             src/app/print-bridge/kitchen/page.tsx — this
 *                             is a separate device/printer from the
 *                             customer-receipt bridge below.
 *   - "receipt:print-requested" / "receipt:print-result" — the customer
 *                             receipt printer bridge (see
 *                             printThermalRawBT.ts and
 *                             src/app/print-bridge/page.tsx)
 *   - "menu:updated"        — anything that can change what the kiosk/QR
 *                             ordering screen should show: a Menu Item
 *                             created/edited/removed, a Menu Item category
 *                             renamed, or a Recipe-linked Ingredient's
 *                             stock changing (manual adjust, PO received,
 *                             or a direct edit) — triggers a refetch of
 *                             /api/products so items and their in-stock
 *                             status stay live without a manual reload.
 */

// The channel name lives in pusher-channels.ts so browser code can import it
// without dragging this server-only module (and the Node SDK) into the bundle.
import { ORDERS_CHANNEL } from "@/lib/pusher-channels";
export { ORDERS_CHANNEL };

export type OrderPaidEvent = { orderNo: string; status: string };

let client: PusherServer | null = null;
let clientFailed = false;

/**
 * Built lazily rather than at module load. The old version ran `new
 * PusherServer({ appId: process.env.PUSHER_APP_ID!, ... })` at import time,
 * so a missing or malformed Pusher env var threw while the *module* was being
 * imported — which takes down every route that imports it, including order
 * creation and cash confirmation, before a single line of their logic runs.
 * Realtime is a nice-to-have here; ordering is not.
 */
function getPusher(): PusherServer | null {
  if (client || clientFailed) return client;

  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) {
    console.warn("Pusher is not configured — realtime updates are disabled.");
    clientFailed = true;
    return null;
  }

  try {
    client = new PusherServer({
      appId: PUSHER_APP_ID,
      key: PUSHER_KEY,
      secret: PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER || "ap1",
      useTLS: true,
    });
  } catch (err) {
    console.error("Could not create the Pusher client:", err);
    clientFailed = true;
  }
  return client;
}

/**
 * Best-effort realtime broadcast. NEVER throws.
 *
 * WHY THIS MATTERS: every caller fires its event *after* the database work has
 * already been committed, and every one of them used to do a bare
 * `await pusher.trigger(...)` with no catch. So a Pusher outage, an expired
 * key, or a blown quota turned an already-successful operation into a 500:
 *
 *   - confirm-cash marked the order PAID, then 500'd. Staff saw an error,
 *     pressed Confirm again, and got a 409 from the atomic status guard —
 *     an order that is genuinely paid, reported as failed twice.
 *   - cancel-order returned the stock, then 500'd, same retry loop.
 *
 * A dropped event costs a stale screen until the next poll or refetch. A
 * thrown event costs a wrong answer about money. So this swallows and logs.
 */
export async function notify(event: string, payload: unknown = {}): Promise<void> {
  const p = getPusher();
  if (!p) return;
  try {
    await p.trigger(ORDERS_CHANNEL, event, payload);
  } catch (err) {
    console.error(`Pusher trigger "${event}" failed (ignored):`, err);
  }
}
