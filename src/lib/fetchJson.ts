"use client";

/**
 * Fetches JSON and returns null instead of throwing, whatever goes wrong.
 *
 * WHY THIS EXISTS: several admin tabs did
 *
 *     fetch(url).then((res) => res.json()).then(setState)
 *
 * with no `res.ok` check. Every admin route answers a failure with a JSON body
 * — `{ error: "Unauthorized" }` on 401, `{ error: ... }` on 409/404/500 — so
 * `res.json()` resolves happily and that error object lands in state as if it
 * were the data. A tab that then calls `.map()` over it throws
 * "entries.map is not a function" and white-screens; a tab that reads a field
 * off it (`data.revenue.toFixed(0)`) throws on undefined. Either way the admin
 * sees a blank page with no clue that the real problem was an expired session.
 *
 * Returning null lets the caller distinguish "loaded" from "failed" and show
 * something honest.
 */
export async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`GET ${url} failed: ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`GET ${url} failed:`, err);
    return null;
  }
}
