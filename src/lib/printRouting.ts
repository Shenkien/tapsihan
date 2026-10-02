/**
 * Which printer prints a customer RECEIPT, for the two-printer layout:
 *
 *   kiosk printer    (Phone A, /print-bridge)          - what the kiosk customer takes with them
 *   counter printer  (Phone B, /print-bridge/counter)  - shared with the kitchen printer
 *
 *   order comes from   receipt requested at order time     payment confirmed by staff
 *   ----------------   ---------------------------------   ---------------------------------
 *   KIOSK              kiosk printer (customer takes it)   counter printer (customer is at
 *                                                          the counter now, not the kiosk)
 *   COUNTER (staff)    nobody (nothing is printed when     counter printer (full receipt with
 *                      the order is entered)               cash received + change)
 *   QR (own phone)     nobody - digital receipt            nobody
 *
 * KITCHEN tickets are separate ("kitchen-ticket:print-requested") and always
 * go to the counter printer in this layout.
 *
 * No browser or server imports, so it is unit-tested (tests/print-routing.test.mjs).
 */
export type ReceiptVariant = "cash-pending" | "gcash-pending" | "paid";
export type OrderSourceName = "KIOSK" | "QR" | "COUNTER";
export type PrintStation = "kiosk" | "counter";

export function receiptStation(source: OrderSourceName, variant: ReceiptVariant): PrintStation | null {
  if (source === "QR") return null;
  if (source === "KIOSK") return variant === "paid" ? "counter" : "kiosk";
  // COUNTER (staff-entered): nothing prints when the order is entered; the
  // full receipt (with cash received + change) prints once staff confirm payment.
  return variant === "paid" ? "counter" : null;
}