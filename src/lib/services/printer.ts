import type { ComboMeal, Order, OrderItem, Payment, Product } from "@prisma/client";
import type { ComboSnapshotItem } from "@/types/models";
import { STORE_NAME } from "@/lib/storeInfo";

/**
 * Printer service — logs formatted tickets instead of sending them to real
 * ESC/POS thermal hardware.
 *
 * NOTE ON STACK CHANGE: the original Express app supported a `PRINTER_MODE=real`
 * path using `escpos` + `escpos-network` to send raw ESC/POS commands over a
 * TCP socket to each printer's IP. Those packages aren't part of the target
 * stack, and long-lived raw TCP sockets are also awkward inside Vercel's
 * serverless functions. This version keeps only the mock/log mode — tickets
 * are recorded in memory (per server instance) and logged to the console —
 * so the full order flow still runs end-to-end without any printer hardware.
 * If you need real thermal printing on Vercel, the cleanest options are a
 * small always-on print-bridge service polling an API route, or a
 * print-via-browser (window.print / a receipt-formatted page) approach.
 */


type OrderItemWithLine = OrderItem & { product: Product | null; comboMeal: ComboMeal | null };
type OrderWithItems = Order & { items: OrderItemWithLine[] };

type PrintLogEntry = { printerName: string; text: string; printedAt: string };

// In-memory log so the staff/admin UI can preview "printed" tickets during
// development. Resets whenever the serverless function cold-starts.
const mockPrintLog: PrintLogEntry[] = [];

function line(char = "=", len = 32) {
  return char.repeat(len);
}

// A combo line prints its name plus its included items indented
// underneath (from the frozen comboItemsSnapshot), so kitchen staff still
// know exactly what to prepare even though it's rung up as one line.
function formatItemsLines(items: OrderItemWithLine[]) {
  return items
    .map((it) => {
      const notePart = it.notes ? ` [${it.notes}]` : "";
      if (it.comboMeal) {
        const snapshot = Array.isArray(it.comboItemsSnapshot) ? (it.comboItemsSnapshot as unknown as ComboSnapshotItem[]) : [];
        const contentsLines = snapshot.map((s) => `   - ${s.qty}x ${s.name}`).join("\n");
        const header = `${it.qty}x ${it.comboMeal.name} (Combo)${notePart}`;
        return contentsLines ? `${header}\n${contentsLines}` : header;
      }
      return `${it.qty}x ${it.product?.name ?? "Item"}${notePart}`;
    })
    .join("\n");
}

function formatOrderNoteLines(order: OrderWithItems) {
  return order.notes ? [`Note: ${order.notes}`, ""] : [];
}

// One line showing the discount (if any) just above the total, so the
// printed/logged copy adds up: subtotal, discount, then what's owed.
function formatDiscountLines(order: { subtotal?: number | null; discountName?: string | null; discountPercent?: number; discountAmount?: number }) {
  if (!order.discountName || order.subtotal == null) return [];
  const lines = [
    `SUBTOTAL: \u20B1${order.subtotal.toFixed(2)}`,
    `${order.discountName.toUpperCase()} ${order.discountPercent ?? 0}%: -\u20B1${(order.discountAmount ?? 0).toFixed(2)}`,
  ];
  return lines;
}

function buildKioskTicketText(order: OrderWithItems) {
  return [
    line(),
    ` ${STORE_NAME}`,
    line(),
    `Order: #${order.orderNo}  Type: ${order.type}`,
    `Time: ${new Date(order.paidAt || order.createdAt).toLocaleTimeString()}  Payment: GCASH \u2713`,
    "",
    formatItemsLines(order.items),
    "",
    ...formatOrderNoteLines(order),
    ...formatDiscountLines(order),
    `TOTAL: \u20B1${order.total.toFixed(2)}`,
    `[CODE: ${order.barcode}]`,
    "\"We'll call your number when your order is ready.\"",
    line(),
  ].join("\n");
}

function buildKioskCashPendingTicketText(order: OrderWithItems) {
  return [
    line(),
    ` ${STORE_NAME}`,
    line(),
    `Order: #${order.orderNo}  Type: ${order.type}`,
    `Time: ${new Date(order.createdAt).toLocaleTimeString()}  Payment: CASH`,
    "",
    formatItemsLines(order.items),
    "",
    ...formatOrderNoteLines(order),
    ...formatDiscountLines(order),
    `TOTAL DUE: \u20B1${order.total.toFixed(2)}`,
    `[BARCODE: ${order.barcode}]`,
    "",
    "*** NOT YET PAID ***",
    "Please bring this receipt to the",
    "counter to pay before your order",
    "is sent to the kitchen.",
    line(),
  ].join("\n");
}

// Same as the cash-pending ticket above, but for a GCash order created at
// the kiosk/counter — printed at order time (not just once staff confirm
// the payment), same as cash now does, so the kiosk can hand the customer
// something and auto-reset instead of babysitting the payment. See
// printThermalRawBT.ts / printReceipt.ts for the actual receipt printed on
// real hardware; this mock version just keeps the dev print-log consistent.
function buildKioskGcashPendingTicketText(order: OrderWithItems) {
  return [
    line(),
    ` ${STORE_NAME}`,
    line(),
    `Order: #${order.orderNo}  Type: ${order.type}`,
    `Time: ${new Date(order.createdAt).toLocaleTimeString()}  Payment: GCASH`,
    "",
    formatItemsLines(order.items),
    "",
    ...formatOrderNoteLines(order),
    ...formatDiscountLines(order),
    `TOTAL DUE: \u20B1${order.total.toFixed(2)}`,
    `[BARCODE: ${order.barcode}]`,
    "",
    "*** GCASH - NOT YET PAID ***",
    "Send payment via the store's GCash",
    "QR/account, then show this receipt",
    "at the counter to confirm.",
    line(),
  ].join("\n");
}

function buildCounterReceiptText(order: OrderWithItems, payment: Payment) {
  return [
    line(),
    ` ${STORE_NAME}`,
    line(),
    `Order: #${order.orderNo}  Type: ${order.type}`,
    `Time: ${new Date(order.paidAt || order.createdAt).toLocaleTimeString()}  Payment: CASH \u2713`,
    "",
    formatItemsLines(order.items),
    "",
    ...formatOrderNoteLines(order),
    ...formatDiscountLines(order),
    `TOTAL: \u20B1${order.total.toFixed(2)}  PAID: \u20B1${(payment.amountReceived ?? 0).toFixed(2)}  CHANGE: \u20B1${(payment.change ?? 0).toFixed(2)}`,
    `[CODE: ${order.barcode}]`,
    "\"We'll call your number when your order is ready.\"",
    line(),
  ].join("\n");
}

function buildKitchenTicketText(order: OrderWithItems) {
  return [
    line(),
    " KITCHEN",
    line(),
    `Order: #${order.orderNo}  Type: ${order.type}`,
    `Time: ${new Date(order.createdAt).toLocaleTimeString()}`,
    "",
    formatItemsLines(order.items),
    "",
    ...formatOrderNoteLines(order),
    "PAID \u2713",
    line(),
  ].join("\n");
}

async function sendMock(printerName: string, text: string) {
  const entry: PrintLogEntry = { printerName, text, printedAt: new Date().toISOString() };
  // Real printing happens client-side (RawBT / the print bridge). This mock
  // only exists for local development, so in production it neither keeps
  // receipt contents in server memory nor writes them to the logs.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PAYMENT_SIMULATION !== "true") return entry;
  mockPrintLog.push(entry);
  if (mockPrintLog.length > 200) mockPrintLog.shift(); // cap memory use
  console.log(`\n----- [MOCK PRINT: ${printerName}] -----\n${text}\n-----------------------------\n`);
  return entry;
}

export async function printKioskTicket(order: OrderWithItems) {
  return sendMock("kiosk", buildKioskTicketText(order));
}

export async function printKioskCashPendingTicket(order: OrderWithItems) {
  return sendMock("kiosk", buildKioskCashPendingTicketText(order));
}

export async function printKioskGcashPendingTicket(order: OrderWithItems) {
  return sendMock("kiosk", buildKioskGcashPendingTicketText(order));
}

export async function printCounterReceipt(order: OrderWithItems, payment: Payment) {
  return sendMock("counter", buildCounterReceiptText(order, payment));
}

export async function printKitchenTicket(order: OrderWithItems) {
  return sendMock("kitchen", buildKitchenTicketText(order));
}

export function getMockPrintLog() {
  return mockPrintLog;
}
