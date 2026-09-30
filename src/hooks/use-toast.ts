"use client";

import * as React from "react";
import type { ToastActionElement } from "@/components/ui/toast";

type ToasterToast = {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
  variant?: "default" | "destructive";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type State = { toasts: ToasterToast[] };

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(toasts: ToasterToast[]) {
  memoryState = { toasts };
  listeners.forEach((listener) => listener(memoryState));
}

function toast({ ...props }: Omit<ToasterToast, "id">) {
  const id = genId();

  const dismiss = () => {
    dispatch(memoryState.toasts.map((t) => (t.id === id ? { ...t, open: false } : t)));
    // Drop it from state once the close animation has had time to finish,
    // rather than leaving a closed-but-still-mounted toast sitting in the
    // array until a later .slice(-3) happens to push it out.
    setTimeout(() => dispatch(memoryState.toasts.filter((t) => t.id !== id)), 300);
  };

  dispatch(
    [
      ...memoryState.toasts,
      {
        ...props,
        id,
        open: true,
        // Radix's <Toast> (ToastPrimitives.Root) treats `open` as a
        // controlled prop, so it calls onOpenChange rather than closing
        // itself directly — on the X button, on swipe-to-dismiss, and on
        // its own internal timers. This object had no onOpenChange, so
        // none of those reached back into this store: `open` never
        // flipped, and Radix silently ignored its own close attempts.
        // Visibly, the X button and swipe gesture did nothing — every
        // toast could only be closed by waiting out the 4s auto-dismiss
        // below. Wiring it back to dismiss() is what makes manual
        // dismissal actually work.
        onOpenChange: (open: boolean) => {
          if (!open) dismiss();
        },
      },
    ].slice(-3)
  );

  setTimeout(dismiss, 4000);

  return { id, dismiss };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return { ...state, toast };
}

export { useToast, toast };
