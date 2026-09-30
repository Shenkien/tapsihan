/**
 * How THIS device prints a receipt at order time.
 *
 *  - "direct": it has RawBT installed and paired to a printer, so it prints
 *    straight away (the original Android-tablet behaviour).
 *  - "bridge": it can't reach a printer itself (a PC, an iPad, or an Android
 *    tablet whose RawBT lives on a different phone), so it asks a bridge phone
 *    over the server to print instead.
 *
 * Default: Android -> direct, everything else -> bridge. An Android kiosk tablet
 * that does NOT have RawBT (the printer is on a separate phone) must be told
 * once: open the kiosk as /kiosk?print=bridge. The choice is remembered on that
 * device and the ?print= part is removed from the address bar
 * (?print=direct switches it back).
 */
export type PrintMode = "direct" | "bridge";

const STORAGE_KEY = "tapsihan.printMode";

export function getPrintMode(): PrintMode {
  if (typeof window === "undefined") return "bridge";
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("print");
    if (fromUrl === "bridge" || fromUrl === "direct") {
      window.localStorage.setItem(STORAGE_KEY, fromUrl);
      url.searchParams.delete("print");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      return fromUrl;
    }
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "bridge" || saved === "direct") return saved;
  } catch {
    // storage blocked: fall through to the default
  }
  return /android/i.test(navigator.userAgent) ? "direct" : "bridge";
}
