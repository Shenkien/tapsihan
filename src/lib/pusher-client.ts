import PusherClient from "pusher-js";

let client: PusherClient | null = null;
let failed = false;

/**
 * Lazily creates (once) and returns the browser Pusher client, or null if it
 * can't be created.
 *
 * `process.env.NEXT_PUBLIC_PUSHER_KEY!` used to be asserted non-null. When
 * that variable is missing at build time the value inlines as `undefined`,
 * PusherClient's constructor throws, and because this runs inside a render
 * effect it takes the whole kiosk screen down with it — over a feature that
 * only powers live updates. Returning null degrades to the polling fallback
 * instead.
 */
export function getPusherClient(): PusherClient | null {
  if (client || failed) return client;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  if (!key) {
    console.warn("NEXT_PUBLIC_PUSHER_KEY is not set — live updates are disabled.");
    failed = true;
    return null;
  }

  try {
    client = new PusherClient(key, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap1",
    });
  } catch (err) {
    console.error("Could not create the Pusher client:", err);
    failed = true;
  }
  return client;
}
