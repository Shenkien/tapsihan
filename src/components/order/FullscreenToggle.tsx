"use client";

import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";

/**
 * A tiny, unobtrusive fullscreen toggle for the kiosk screen.
 *
 * iPad Safari does not implement the Fullscreen API for ordinary elements
 * (only <video>), so `document.fullscreenEnabled` is false there and this
 * renders nothing — on iPad, getting rid of the address bar means adding
 * this page to the home screen instead (see the manifest + apple-mobile-
 * web-app-capable meta tag in layout.tsx) and launching it from that icon.
 *
 * Android tablets and desktop browsers DO support this API, so on that
 * hardware this button does the real thing: puts the whole page into the
 * OS-level fullscreen mode, hiding the browser chrome entirely.
 */
export default function FullscreenToggle() {
  const [supported, setSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setSupported(typeof document !== "undefined" && document.fullscreenEnabled === true);

    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleChange);
    handleChange();
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  if (!supported) return null;

  async function toggle() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        // Fullscreen must be requested from a direct user gesture (this
        // click) — calling it from anywhere else (e.g. on page load) is
        // silently rejected by every browser that supports it.
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Some browsers reject this if the tab isn't focused/visible yet —
      // nothing useful to do beyond letting the button be tapped again.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      className="fixed right-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-charcoal-900/10 text-charcoal-900/50 backdrop-blur-sm transition hover:bg-charcoal-900/20"
    >
      {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
    </button>
  );
}
