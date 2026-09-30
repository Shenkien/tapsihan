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
 *   COUNTER (staff)    counter printer (full receipt)      nobody - the kitchen ticket that
 *                                                          prints on the same printer at that
 *                                                          moment already shows the order
 *                                                          number and items
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
  return variant === "paid" ? null : "counter";
}
