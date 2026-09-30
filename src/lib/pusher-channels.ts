// Shared by the server (lib/pusher.ts) and the browser (usePusherEvent, the
// print-bridge pages). Keep this file free of imports: a client component must
// never have to pull in the Node `pusher` SDK (or anything reading
// PUSHER_SECRET) just to learn the channel name.
export const ORDERS_CHANNEL = "orders";
