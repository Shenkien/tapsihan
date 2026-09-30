/**
 * Client side of lib/bridge-auth.ts. The key is never bundled into the app:
 * staff open the bridge page once as /print-bridge?key=THE_KEY, it is saved in
 * this device's localStorage, and the ?key= part is removed from the address
 * bar. After that every ack automatically carries it.
 */
const STORAGE_KEY = "tapsihan.bridgeKey";

export function getBridgeKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("key");
    if (fromUrl) {
      window.localStorage.setItem(STORAGE_KEY, fromUrl);
      url.searchParams.delete("key");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      return fromUrl;
    }
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Headers for a bridge ack request. */
export function bridgeHeaders(): Record<string, string> {
  const key = getBridgeKey();
  return key
    ? { "Content-Type": "application/json", "x-bridge-key": key }
    : { "Content-Type": "application/json" };
}
