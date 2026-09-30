"use client";

import { useEffect, useState } from "react";

/** Current time in ms, refreshed on an interval — lets "waiting 12 min" style labels and colours stay live. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
