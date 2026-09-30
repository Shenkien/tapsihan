"use client";

import { useEffect } from "react";

/**
 * `Cache-Control: no-store` (set on /staff and /admin because their layouts
 * call requireRole(), making Next treat the route as dynamic) is supposed to
 * stop the browser from bfcache-restoring these pages. In practice, current
 * Chromium (Chrome/Brave/Edge) can still serve a page from bfcache on Back
 * even when it was sent with `no-store` — the header no longer reliably
 * disables bfcache eligibility the way it used to.
 *
 * That means after logging out, hitting Back can briefly repaint the old
 * authenticated DOM straight from memory, without the browser ever asking
 * the server again — so proxy.ts and requireRole() never get a chance to
 * run and redirect.
 *
 * The fix: listen for `pageshow` and check `event.persisted`, which is true
 * only when the page came from bfcache rather than a fresh navigation. When
 * that happens, force a real reload — which does hit the server, does run
 * the auth check, and does redirect to /login if the
 * session is gone.
 *
 * Mount this once near the root of each protected layout (staff and admin).
 */
export default function BfcacheGuard() {
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return null;
}
