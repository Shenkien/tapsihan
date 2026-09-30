import crypto from "crypto";

/**
 * The print-bridge pages (/print-bridge, /print-bridge/kitchen,
 * /print-bridge/usb) run on the phone/PC paired to a printer and report back
 * with an "ack" after each print attempt. Those ack routes are public URLs,
 * so anyone could otherwise POST a fake "printed" result and make the kiosk
 * think a receipt came out.
 *
 * A shared secret fixes that: PRINT_BRIDGE_KEY is set on the server, typed
 * once on each bridge device (open the bridge page with ?key=... — see
 * lib/bridgeKey.ts), and sent as the x-bridge-key header on every ack.
 *
 * If PRINT_BRIDGE_KEY is not set: production refuses every ack (fail
 * closed), local development lets them through so nothing needs configuring.
 */
export const BRIDGE_KEY_HEADER = "x-bridge-key";

function digest(value: string) {
  return crypto.createHash("sha256").update(value).digest();
}

export function isBridgeAuthorized(req: Request): boolean {
  const expected = process.env.PRINT_BRIDGE_KEY;
  if (!expected) return process.env.NODE_ENV !== "production";
  const given = req.headers.get(BRIDGE_KEY_HEADER);
  if (!given) return false;
  // Hash both sides so the comparison is constant-time and length-safe.
  return crypto.timingSafeEqual(digest(given), digest(expected));
}
