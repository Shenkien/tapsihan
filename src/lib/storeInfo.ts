/**
 * Store details shown on customer-facing receipts (thermal print, RawBT
 * silent print, and the downloadable digital-receipt image).
 *
 * Both fields are read from NEXT_PUBLIC_* env vars so they can be changed
 * per deployment without touching code — set them in `.env` (see
 * `.env.example`). They need the `NEXT_PUBLIC_` prefix because these
 * receipt builders run in the browser (kiosk), not on the server, and only
 * `NEXT_PUBLIC_*` env vars are available client-side in Next.js.
 *
 * STORE_NAME used to be hardcoded here to "KUY'S TAPSIHAN" while
 * `.env.example` documented a plain (non-`NEXT_PUBLIC_`) `STORE_NAME` var
 * that this file never actually read — so setting it in `.env` silently did
 * nothing. It's now wired up the same way STORE_ADDRESS already was.
 *
 * No phone number is printed on the receipt (by request).
 */
export const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "KUY'S TAPSIHAN";
export const STORE_ADDRESS =
  process.env.NEXT_PUBLIC_STORE_ADDRESS || "MLQ St., Lower Bicutan, Taguig, Philippines, 1637";
export const RECEIPT_THANK_YOU = "Thank you for dining with us \u2014 see you again soon!";
