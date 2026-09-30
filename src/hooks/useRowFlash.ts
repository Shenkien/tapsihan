"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Remembers which row was just saved so it can flash green for a moment.
 *   const { flash, flashClass } = useRowFlash();
 *   ... after a successful save: flash(id)
 *   ... on the row: className={`... ${flashClass(id)}`}
 */
export function useRowFlash(durationMs = 1900) {
  const [flashId, setFlashId] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(
    (id: number) => {
      if (timer.current) clearTimeout(timer.current);
      setFlashId(id);
      timer.current = setTimeout(() => setFlashId(null), durationMs);
    },
    [durationMs]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const flashClass = useCallback((id: number) => (flashId === id ? "row-flash" : ""), [flashId]);
  return { flash, flashClass };
}
