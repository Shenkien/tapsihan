"use client";

import jsPDF from "jspdf";
import { orderItemComboContents, orderItemName, type OrderRecord } from "@/types/models";
import { STORE_NAME, STORE_ADDRESS, RECEIPT_THANK_YOU } from "@/lib/storeInfo";
import { fetchGcashAccountInfo } from "@/lib/gcashAccountInfo";
import { RECEIPT_LOGO_DATA_URI, RECEIPT_LOGO_WIDTH_MM, RECEIPT_LOGO_HEIGHT_MM } from "@/lib/receiptLogo";

/**
 * Silent thermal printing for the self-service kiosk, via RawBT.
 *
 * WHY THIS EXISTS: printReceipt.ts's window.print() approach works, but on
 * Android it always surfaces Chrome's print picker (pick "RawBT" > tap
 * "Print") — fine with a cashier standing by, but this kiosk is
 * self-service, so a customer checking out has no reason to know to do
 * that. RawBT (the print-service app bridging Chrome to the PT-210 over
 * Bluetooth) also accepts print jobs silently via its own `rawbt:` URI
 * scheme, with NO dialog at all — as long as the payload is a
 * base64-encoded PDF:
 *
 *   rawbt:data:application/pdf;base64,<...>
 *
 * Navigating to that URL (window.location.href = ...) hands the job
 * straight to RawBT, which prints immediately on whatever printer is
 * currently selected inside the RawBT app (the PT-210, per your existing
 * setup — 203dpi, 384 dots / 48mm).
 *
 * WHY A HAND-BUILT PDF INSTEAD OF THE EXISTING HTML RECEIPT: RawBT's silent
 * `rawbt:` route is only reliably documented for a PDF payload, not raw
 * HTML — so this draws the receipt directly with jsPDF (text + the barcode
 * image) instead of reusing buildKioskReceiptHtml's CSS-based layout.
 * Layout is done by hand in millimeters, so it won't pixel-match the HTML
 * version exactly, but it prints to the same 48mm content width.
 *
 * PESO SIGN: the "₱" character isn't in jsPDF's built-in Courier font
 * encoding and would print blank/garbled, so totals here print as
 * "P123.00" instead of "₱123.00". If you need the real ₱ glyph, a
 * Unicode-capable font would need to be embedded in jsPDF — more setup,
 * so this was skipped for now.
 *
 * ONE-TIME SETUP: install RawBT on the kiosk tablet, pair the PT-210 over
 * Bluetooth, open RawBT and select it as the printer at 384 dots / 48mm
 * (already done, per your Edit Printer screenshot).
 *
 * FIRST-RUN PROMPT: Chrome may show a one-time "Open with RawBT?" prompt
 * the very first time it navigates to a rawbt: link on a given device —
 * checking "Always open" / "Don't ask again" on that prompt is what makes
 * every print after that fully silent. That's a Chrome/Android behavior,
 * not something this code can skip.
 *
 * NOT YET TESTED ON REAL HARDWARE: the exact y-spacing below is a
 * reasonable estimate, not something verified against your PT-210 —
 * print one real receipt and check nothing looks cramped or cut off at
 * the bottom. If so, nudge the increments in this file (they're all in
 * millimeters) rather than rewriting the layout.
 */

const PAGE_WIDTH_MM = 48;
const MARGIN_MM = 2;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;

type ReceiptVariant = "cash-pending" | "gcash-pending" | "paid";

// Cash tendered + change, shown on a paid CASH receipt only. Comes from the
// Payment row staff filled in on the counter screen (amountReceived/change).
// Returns null for GCash, unpaid variants, or old rows with no amount saved.
function cashTendered(order: OrderRecord, variant: ReceiptVariant) {
  if (variant !== "paid" || order.paymentMethod !== "CASH") return null;
  const received = order.payment?.amountReceived;
  if (received == null) return null;
  const change = order.payment?.change ?? Math.max(0, received - order.total);
  return { received, change };
}

// Rough per-section height estimate so the PDF page is tall enough to fit
// everything. jsPDF pages don't auto-grow, so this errs generous — a little
// extra blank paper at the end is harmless on a continuous thermal roll,
// but content cut off at the bottom is not.
function estimateHeightMm(order: OrderRecord, opts: { barcodeImage: string | null; variant: ReceiptVariant }) {
  let mm = 28 + 17; // header block (+17 for the logo): store name, address, contact, order#/type, time, divider
  for (const item of order.items) {
    mm += 4;
    const combo = orderItemComboContents(item);
    if (combo) mm += combo.length * 3.5;
  }
  if (order.notes) mm += 8;
  mm += 8; // divider + total row
  if (order.discountName && order.subtotal != null) mm += 10; // subtotal + discount lines
  // Status block: cash-pending and gcash-pending both wrap a couple of
  // sentences of instructions, so both need real room; gcash-pending gets
  // a little extra since it may also carry the store's account name/number.
  mm += opts.variant === "cash-pending" ? 16 : opts.variant === "gcash-pending" ? 20 : 6;
  if (cashTendered(order, opts.variant)) mm += 9; // CASH + CHANGE rows
  mm += opts.barcodeImage ? 22 : 6; // barcode image or fallback text
  mm += 22; // footer (wrapped lines) + bottom margin, plus a wrapped address line
  return Math.max(mm, 60);
}

export async function printThermalReceiptSilent(
  order: OrderRecord,
  opts: { barcodeImage: string | null; variant: ReceiptVariant }
) {
  if (typeof window === "undefined") return;

  // Only fetched for gcash-pending — the printed account name/number is
  // what lets the customer pay after the kiosk has already auto-reset and
  // the on-screen QR is gone (see fetchGcashAccountInfo).
  const gcashAccount = opts.variant === "gcash-pending" ? await fetchGcashAccountInfo() : null;

  const heightMm = estimateHeightMm(order, opts);
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH_MM, heightMm] });
  const cx = PAGE_WIDTH_MM / 2;
  let y = 3;

  // Logo, centered above the store name. Best-effort: a problem drawing it
  // must never stop the receipt from printing.
  try {
    doc.addImage(RECEIPT_LOGO_DATA_URI, "PNG", cx - RECEIPT_LOGO_WIDTH_MM / 2, y, RECEIPT_LOGO_WIDTH_MM, RECEIPT_LOGO_HEIGHT_MM);
    // A line on each side of the logo, level with its middle and set back
    // from it, so the logo doesn't sit alone:  ------  (logo)  ------
    const lineY = y + RECEIPT_LOGO_HEIGHT_MM / 2;
    const gap = 3;
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_MM, lineY, cx - RECEIPT_LOGO_WIDTH_MM / 2 - gap, lineY);
    doc.line(cx + RECEIPT_LOGO_WIDTH_MM / 2 + gap, lineY, PAGE_WIDTH_MM - MARGIN_MM, lineY);
    y += RECEIPT_LOGO_HEIGHT_MM + 4;
  } catch {
    y = 6;
  }

  doc.setFont("courier", "bold");
  doc.setFontSize(13);
  doc.text(STORE_NAME, cx, y, { align: "center" });
  y += 4;

  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  // The address is long (e.g. "MLQ St., Lower Bicutan, Taguig, Philippines,
  // 1637"), so wrap it to the printable width instead of letting it run off
  // both edges of the paper.
  const addressLines = doc.splitTextToSize(STORE_ADDRESS, CONTENT_WIDTH_MM);
  doc.text(addressLines, cx, y, { align: "center" });
  y += addressLines.length * 3.2 + 0.8;

  doc.setFontSize(9);
  doc.text(
    `Order #${order.orderNo} - ${order.type === "DINE_IN" ? "Dine-in" : "Takeout"}`,
    cx,
    y,
    { align: "center" }
  );
  y += 4;

  const time = new Date(order.paidAt || order.createdAt).toLocaleString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  doc.setFontSize(8);
  doc.text(time, cx, y, { align: "center" });
  y += 3;

  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(MARGIN_MM, y, PAGE_WIDTH_MM - MARGIN_MM, y);
  y += 4;

  doc.setFontSize(9);
  for (const item of order.items) {
    doc.text(`${item.qty}x ${orderItemName(item)}`, MARGIN_MM, y);
    doc.text((item.unitPrice * item.qty).toFixed(2), PAGE_WIDTH_MM - MARGIN_MM, y, { align: "right" });
    y += 4;
    const combo = orderItemComboContents(item);
    if (combo && combo.length) {
      doc.setFontSize(7.5);
      for (const c of combo) {
        doc.text(`  ${c.qty}x ${c.name}`, MARGIN_MM + 2, y);
        y += 3.5;
      }
      doc.setFontSize(9);
    }
  }

  if (order.notes) {
    y += 1;
    doc.setFont("courier", "italic");
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(`Note: ${order.notes}`, CONTENT_WIDTH_MM);
    doc.text(noteLines, MARGIN_MM, y);
    y += noteLines.length * 3.5;
    doc.setFont("courier", "normal");
  }

  y += 2;
  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(MARGIN_MM, y, PAGE_WIDTH_MM - MARGIN_MM, y);
  y += 5;

  if (order.discountName && order.subtotal != null) {
    // Thermal fonts here are ASCII-only (see the note at the top), so the
    // peso sign prints as "P" and the minus as a plain hyphen.
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.text("Subtotal", MARGIN_MM, y);
    doc.text(`P${order.subtotal.toFixed(2)}`, PAGE_WIDTH_MM - MARGIN_MM, y, { align: "right" });
    y += 4;
    const label = doc.splitTextToSize(`${order.discountName} ${order.discountPercent ?? 0}%`, CONTENT_WIDTH_MM - 22)[0];
    doc.text(label, MARGIN_MM, y);
    doc.text(`-P${(order.discountAmount ?? 0).toFixed(2)}`, PAGE_WIDTH_MM - MARGIN_MM, y, { align: "right" });
    y += 4;
    y += 1;
  }

  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL", MARGIN_MM, y);
  doc.text(`P${order.total.toFixed(2)}`, PAGE_WIDTH_MM - MARGIN_MM, y, { align: "right" });
  y += 5;

  const tendered = cashTendered(order, opts.variant);
  if (tendered) {
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.text("CASH", MARGIN_MM, y);
    doc.text(`P${tendered.received.toFixed(2)}`, PAGE_WIDTH_MM - MARGIN_MM, y, { align: "right" });
    y += 4;
    doc.setFont("courier", "bold");
    doc.text("CHANGE", MARGIN_MM, y);
    doc.text(`P${tendered.change.toFixed(2)}`, PAGE_WIDTH_MM - MARGIN_MM, y, { align: "right" });
    y += 4;
  }
  y += 1;

  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  if (opts.variant === "cash-pending") {
    doc.setFont("courier", "bold");
    doc.text("*** NOT YET PAID ***", cx, y, { align: "center" });
    y += 4;
    doc.setFont("courier", "normal");
    const lines = doc.splitTextToSize(
      "Please bring this receipt to the counter to pay before your order is sent to the kitchen.",
      CONTENT_WIDTH_MM
    );
    doc.text(lines, cx, y, { align: "center" });
    y += lines.length * 3.5 + 2;
  } else if (opts.variant === "gcash-pending") {
    doc.setFont("courier", "bold");
    doc.text("*** GCASH - NOT YET PAID ***", cx, y, { align: "center" });
    y += 4;
    doc.setFont("courier", "normal");
    // Falls back to "scan the kiosk's QR" only if no account name/number
    // was ever saved in Admin > Maintenance > GCash Payment — normal setup
    // always has one of these to print.
    const accountLine = [gcashAccount?.accountName, gcashAccount?.accountNumber].filter(Boolean).join(" \u00b7 ");
    const instructions = accountLine
      ? `Send GCash payment to ${accountLine}, then show this receipt at the counter to confirm.`
      : "Scan the GCash QR at the kiosk to pay, then show this receipt at the counter to confirm.";
    const lines = doc.splitTextToSize(instructions, CONTENT_WIDTH_MM);
    doc.text(lines, cx, y, { align: "center" });
    y += lines.length * 3.5 + 2;
  } else {
    doc.text(
      `Payment: ${order.paymentMethod === "GCASH" ? "GCASH (paid)" : "CASH (paid)"}`,
      cx,
      y,
      { align: "center" }
    );
    y += 5;
  }

  if (opts.barcodeImage) {
    const imgWidth = 40;
    const imgHeight = 14;
    doc.addImage(opts.barcodeImage, "PNG", cx - imgWidth / 2, y, imgWidth, imgHeight);
    y += imgHeight + 3;
  } else {
    doc.text(order.barcode, cx, y, { align: "center" });
    y += 5;
  }

  doc.setFontSize(8);
  // Wrap this too: at 8pt it is wider than the 44mm printable width.
  const readyLines = doc.splitTextToSize("We'll call your number when ready.", CONTENT_WIDTH_MM);
  doc.text(readyLines, cx, y, { align: "center" });
  y += readyLines.length * 3.5;
  const thankYouLines = doc.splitTextToSize(RECEIPT_THANK_YOU, CONTENT_WIDTH_MM);
  doc.text(thankYouLines, cx, y, { align: "center" });

  const dataUri = doc.output("datauristring");
  const base64 = dataUri.split(",")[1];
  window.location.href = `rawbt:data:application/pdf;base64,${base64}`;
}