"use client";

import jsPDF from "jspdf";
import { orderItemComboContents, orderItemName, type OrderRecord } from "@/types/models";
import { STORE_NAME } from "@/lib/storeInfo";
import { RECEIPT_LOGO_DATA_URI, RECEIPT_LOGO_WIDTH_MM, RECEIPT_LOGO_HEIGHT_MM } from "@/lib/receiptLogo";

/**
 * Silent thermal printing for the KITCHEN ticket, via RawBT — the kitchen's
 * OWN printer, a second device/pairing separate from the one printing
 * customer receipts (see printThermalRawBT.ts for that one).
 *
 * WHY THIS IS A SEPARATE FILE/DEVICE INSTEAD OF REUSING THE RECEIPT PRINTER:
 * the customer receipt (printThermalRawBT.ts) is the customer's own copy —
 * it has prices, payment method, "thank you" — none of which the kitchen
 * needs, and handing the kitchen a price-bearing slip meant for the
 * customer is the wrong document for the wrong reader. This ticket is
 * built specifically for whoever is cooking: just the order number (large,
 * first thing on the slip), what to make, and any note — nothing else.
 * It also serves a second job once the food is done: this SAME printed
 * slip is what travels with the food back to the counter, so staff can
 * glance at the order number on the ticket and match it to the right
 * customer without re-reading the whole queue.
 *
 * RawBT prints on whichever printer is selected inside the RawBT app on
 * THIS device — so the kitchen ticket only ever prints correctly on
 * whichever device/tab is open at .../print-bridge/kitchen with RawBT
 * paired to the kitchen's own thermal printer. Printing it from the same
 * device paired to the counter/kiosk printer would just print it on the
 * wrong printer. See src/app/print-bridge/kitchen/page.tsx for the page
 * that calls this.
 *
 * Same silent-print mechanism as printThermalRawBT.ts: a jsPDF page is
 * built by hand (in millimeters, 48mm content width) and handed to RawBT
 * via its `rawbt:data:application/pdf;base64,<...>` URI, which prints with
 * no dialog — see that file's header comment for the one-time device setup
 * (install RawBT, pair the printer, "Always open" on the first rawbt: link).
 * That one-time setup has to be repeated on the kitchen's OWN device too,
 * pairing THIS device to the KITCHEN printer specifically, not the counter
 * one.
 */

const PAGE_WIDTH_MM = 48;
const MARGIN_MM = 2;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;

// Rough per-section height estimate, same reasoning as
// printThermalRawBT.ts's estimateHeightMm — errs generous so nothing gets
// cut off at the bottom of the slip.
function estimateHeightMm(order: OrderRecord) {
  // Header block: logo, store name, "KITCHEN COPY", big order #, type, time, divider.
  // It now runs to roughly y = 56 mm (logo ~19.5 + name/copy/#/type/time ~30 + divider),
  // so the base has to cover that or the bottom of the slip gets cut off.
  let mm = 58 + 10; // +10 for the boxed PAID stamp under the time
  for (const item of order.items) {
    mm += 5; // item lines are printed larger than the receipt's, so a bit taller
    const combo = orderItemComboContents(item);
    if (combo) mm += combo.length * 4;
  }
  if (order.notes) mm += 10; // order-level note, printed bold/larger — it matters in the kitchen
  mm += 3 + 3 * 3 + 4; // dashed trailer lines + bottom margin
  return Math.max(mm, 50);
}

export function printKitchenTicketSilent(order: OrderRecord) {
  if (typeof window === "undefined") return;

  const heightMm = estimateHeightMm(order);
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH_MM, heightMm] });
  const cx = PAGE_WIDTH_MM / 2;
  let y = 3;

  // Same logo as the customer receipt (see printThermalRawBT.ts), centered
  // above the store name with a line on each side:  ------  (logo)  ------
  // Best-effort: a problem drawing it must never stop the ticket printing.
  try {
    doc.addImage(RECEIPT_LOGO_DATA_URI, "PNG", cx - RECEIPT_LOGO_WIDTH_MM / 2, y, RECEIPT_LOGO_WIDTH_MM, RECEIPT_LOGO_HEIGHT_MM);
    const lineY = y + RECEIPT_LOGO_HEIGHT_MM / 2;
    const gap = 3;
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_MM, lineY, cx - RECEIPT_LOGO_WIDTH_MM / 2 - gap, lineY);
    doc.line(cx + RECEIPT_LOGO_WIDTH_MM / 2 + gap, lineY, PAGE_WIDTH_MM - MARGIN_MM, lineY);
    doc.setLineWidth(0.2); // back to default so the dashed dividers below look as before
    y += RECEIPT_LOGO_HEIGHT_MM + 4;
  } catch {
    y = 6;
  }

  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.text(STORE_NAME, cx, y, { align: "center" });
  y += 4;

  doc.setFontSize(8);
  doc.text("KITCHEN COPY", cx, y, { align: "center" });
  // The 22pt order number below is ~5.5 mm tall from its baseline up, so the
  // baseline needs to sit well below "KITCHEN COPY" (it used to be only 5 mm,
  // which made the two lines overlap on the printed slip).
  y += 10;

  // The order number is the single most important thing on this slip — it's
  // how staff match the finished food back to the right customer once the
  // kitchen hands it over — so it's printed far larger than anything on the
  // customer receipt.
  doc.setFontSize(22);
  doc.text(`#${order.orderNo}`, cx, y, { align: "center" });
  y += 7;

  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.text(order.type === "DINE_IN" ? "DINE-IN" : "TAKEOUT", cx, y, { align: "center" });
  y += 4;

  const time = new Date(order.paidAt || order.createdAt).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  doc.setFontSize(7.5);
  doc.text(time, cx, y, { align: "center" });
  y += 3;

  // "PAID" is printed here, in the header, as a boxed stamp. It used to be the
  // very last line on the slip, but the last few mm of a thermal slip sit
  // under the printer's tear bar and get torn off with the paper, so a line
  // there is what kept getting cut off. Nothing important belongs down there.
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(0.4);
  doc.roundedRect(cx - 9, y, 18, 6.5, 1, 1);
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text("PAID", cx, y + 4.7, { align: "center" });
  doc.setLineWidth(0.2);
  y += 6.5 + 3.5;

  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(MARGIN_MM, y, PAGE_WIDTH_MM - MARGIN_MM, y);
  y += 5;

  // Items only — no prices, no payment method, no "thank you". This is
  // exclusively "what to cook", not a copy of the receipt.
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  for (const item of order.items) {
    const lines = doc.splitTextToSize(`${item.qty}x ${orderItemName(item)}`, CONTENT_WIDTH_MM);
    doc.text(lines, MARGIN_MM, y);
    y += lines.length * 4.5;

    const combo = orderItemComboContents(item);
    if (combo && combo.length) {
      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      for (const c of combo) {
        doc.text(`  ${c.qty}x ${c.name}`, MARGIN_MM + 2, y);
        y += 4;
      }
      doc.setFont("courier", "bold");
      doc.setFontSize(11);
    }
  }

  if (order.notes) {
    y += 1.5;
    doc.setLineDashPattern([0.5, 0.5], 0);
    doc.line(MARGIN_MM, y, PAGE_WIDTH_MM - MARGIN_MM, y);
    y += 4;
    doc.setFont("courier", "bolditalic");
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(`NOTE: ${order.notes}`, CONTENT_WIDTH_MM);
    doc.text(noteLines, MARGIN_MM, y);
    y += noteLines.length * 4;
  }

  // Sacrificial trailer: a few dashed lines that carry no information. RawBT /
  // the printer drop blank paper at the end of a job, so extra whitespace
  // doesn't push content clear of the tear bar — printed ink does. Whatever
  // gets torn off at the bottom is now only these lines.
  y += 3;
  doc.setLineDashPattern([0.5, 0.5], 0);
  for (let i = 0; i < 3; i++) {
    doc.line(MARGIN_MM, y, PAGE_WIDTH_MM - MARGIN_MM, y);
    y += 3;
  }

  const dataUri = doc.output("datauristring");
  const base64 = dataUri.split(",")[1];
  window.location.href = `rawbt:data:application/pdf;base64,${base64}`;
}