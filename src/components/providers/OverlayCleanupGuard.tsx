"use client";

import { useEffect } from "react";

// Workaround for a long-standing Radix UI bug (see e.g.
// github.com/radix-ui/primitives issues #1836 and #2453): a modal overlay
// (Dialog, AlertDialog, Select, etc.) sets `pointer-events: none` on
// <body> while it's open, so only the overlay itself is clickable, then
// is supposed to remove that on close. When the overlay is closed from an
// async callback — e.g. `setOpen(false)` inside a `.then()`/`await`
// continuation after a fetch resolves, rather than directly from the
// click Radix itself handled — that cleanup can lose the race and never
// run. The overlay disappears, but <body> is left permanently
// unclickable: every button and link on the page stops responding until
// a full reload, even though nothing is visibly open anymore.
//
// This watches <body>'s style attribute and, whenever pointer-events is
// "none" but no Radix overlay is actually open anymore, clears it. It
// never touches a real, currently-open modal — only the stuck leftover
// state after one has already closed.
export default function OverlayCleanupGuard() {
  useEffect(() => {
    const OPEN_OVERLAY_SELECTOR = '[data-state="open"][role="dialog"], [data-state="open"][role="listbox"], [data-state="open"][role="alertdialog"]';

    const clearIfStuck = () => {
      const { body } = document;
      if (body.style.pointerEvents !== "none") return;
      if (document.querySelector(OPEN_OVERLAY_SELECTOR)) return;
      body.style.pointerEvents = "";
    };

    // Catches it right when it happens (dialog/select closing).
    const observer = new MutationObserver(clearIfStuck);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });

    // Belt-and-suspenders sweep, in case the stuck style was set before
    // this component mounted or the mutation was otherwise missed.
    const interval = setInterval(clearIfStuck, 1000);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  return null;
}
