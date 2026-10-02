"use client";

import { orderItemComboContents, orderItemName, type OrderRecord } from "@/types/models";
import { STORE_NAME, STORE_ADDRESS, RECEIPT_THANK_YOU } from "@/lib/storeInfo";
import { fetchGcashAccountInfo } from "@/lib/gcashAccountInfo";
import { RECEIPT_LOGO_DATA_URI, RECEIPT_LOGO_WIDTH_MM } from "@/lib/receiptLogo";

/**
 * Real physical printing for the kiosk's USB-connected receipt printer
 * (e.g. GOOJPRT/PT-210, 58mm portable thermal printer).
 *
 * WHY THIS APPROACH: the app's backend runs on Vercel (serverless), which
 * has no access to a USB device plugged into the kiosk terminal — see the
 * NOTE at the top of `src/lib/services/printer.ts`. The printer itself,
 * however, IS reachable from the kiosk's own browser: once its USB driver
 * is installed on the kiosk PC, it shows up as a normal system printer, and
 * a page can send it a print job the same way it would print to any other
 * printer, via `window.print()`. This module builds a receipt formatted for
 * a 58mm roll (barcode included) and prints it in a hidden iframe so it
 * never disturbs the visible kiosk screen.
 *
 * ONE-TIME SETUP ON THE KIOSK PC:
 *   1. Plug in the PT-210 via USB and install its Windows driver (comes on
 *      a disc/link from the manufacturer, or search "GOOJPRT PT-210
 *      driver"). It will appear as a printer in Windows' printer list.
 *   2. Set it as the DEFAULT printer (Windows Settings > Printers & Scanners).
 *   3. For fully silent printing (no "Print" dialog popping up on every
 *      order), launch the kiosk browser with the `--kiosk-printing` flag,
 *      e.g. a Chrome shortcut with target:
 *        chrome.exe --kiosk-printing --app=https://your-kiosk-url
 *      That flag makes `window.print()` go straight to the default printer
 *      with no dialog and no "destination" prompt.
 *   Without step 3, every print still works — the browser just shows the
 *   normal print dialog first (staff can also print the OS way, e.g.
 *   Ctrl+P, to sanity-check the printer any time).
 */

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type ReceiptVariant = "cash-pending" | "gcash-pending" | "paid";

/**
 * Builds a full standalone HTML document for one receipt, sized for a
 * 58mm thermal roll. `barcodeImage` should be the same Code39 data URI
 * the kiosk already gets back from POST /api/orders (`data.barcodeImage`)
 * — reusing it means the barcode on paper always matches `order.barcode`,
 * which is exactly what the /staff counter page's scanner input reads.
 *
 * Async because the "gcash-pending" variant fetches the store's GCash
 * account name/number (see fetchGcashAccountInfo) to print alongside the
 * "not yet paid" banner — the counter kiosk auto-resets its on-screen QR
 * after a short countdown, so the paper needs to carry enough on its own
 * for the customer to actually send the payment.
 */
export async function buildKioskReceiptHtml(
  order: OrderRecord,
  opts: { barcodeImage: string | null; variant: ReceiptVariant }
) {
  const gcashAccount = opts.variant === "gcash-pending" ? await fetchGcashAccountInfo() : null;
  const itemsHtml = order.items
    .map((item) => {
      const combo = orderItemComboContents(item);
      const comboLines =
        combo && combo.length
          ? combo.map((c) => `<div class="sub">${c.qty}x ${escapeHtml(c.name)}</div>`).join("")
          : "";
      return `
        <div class="item-row">
          <span>${item.qty}x ${escapeHtml(orderItemName(item))}</span>
          <span>\u20B1${(item.unitPrice * item.qty).toFixed(2)}</span>
        </div>
        ${comboLines}`;
    })
    .join("");

  const time = new Date(order.paidAt || order.createdAt).toLocaleString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const gcashAccountLine = [gcashAccount?.accountName, gcashAccount?.accountNumber]
    .filter(Boolean)
    .join(" \u00b7 ");

  const statusBlock =
    opts.variant === "cash-pending"
      ? `<div class="banner">*** NOT YET PAID ***</div>
         <div class="center small">Please bring this receipt to the counter to pay.<br/>Your order is sent to the kitchen once staff confirms payment.</div>`
      : opts.variant === "gcash-pending"
      ? `<div class="banner">*** GCASH - NOT YET PAID ***</div>
         <div class="center small">${
           gcashAccountLine
             ? `Send GCash payment to ${escapeHtml(gcashAccountLine)}.<br/>`
             : "Scan the GCash QR at the kiosk to pay.<br/>"
         }Then show this receipt at the counter to confirm.</div>`
      : `<div class="center">Payment: ${order.paymentMethod === "GCASH" ? "GCASH \u2713" : "CASH \u2713"}</div>`;

  // Cash tendered + change on a paid CASH receipt (from the Payment row staff
  // filled in at the counter). Empty for GCash, unpaid variants, or old rows.
  const received = order.payment?.amountReceived;
  const tenderedHtml =
    opts.variant === "paid" && order.paymentMethod === "CASH" && received != null
      ? `<div class="item-row"><span>CASH</span><span>\u20B1${received.toFixed(2)}</span></div>
  <div class="item-row"><b>CHANGE</b><b>\u20B1${(order.payment?.change ?? Math.max(0, received - order.total)).toFixed(2)}</b></div>`
      : "";

  const barcodeBlock = opts.barcodeImage
    ? `<img class="barcode" src="${opts.barcodeImage}" alt="barcode" />`
    : `<div class="center mono">${escapeHtml(order.barcode)}</div>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 48mm;
    margin: 0 auto;
    padding: 2mm 1mm 4mm;
    font-family: "Courier New", monospace;
    font-size: 11px;
    line-height: 1.35;
    color: #000;
  }
  .center { text-align: center; }
  .small { font-size: 9px; }
  .mono { font-family: "Courier New", monospace; }
  .logo-row { display: flex; align-items: center; gap: 3mm; margin: 0 0 2px; }
  .logo-row .line { flex: 1; border-top: 1px solid #000; }
  .logo { display: block; width: ${RECEIPT_LOGO_WIDTH_MM}mm; height: auto; flex: none; }
  .store-name { font-size: 15px; font-weight: bold; letter-spacing: 0.5px; }
  .store-info { font-size: 9px; }
  hr { border: none; border-top: 1px dashed #000; margin: 3px 0; }
  .item-row { display: flex; justify-content: space-between; gap: 4px; }
  .sub { padding-left: 8px; font-size: 10px; }
  .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; margin-top: 4px; }
  .banner { text-align: center; font-weight: bold; margin: 4px 0; }
  .barcode { display: block; margin: 6px auto 0; max-width: 100%; }
  .footer { text-align: center; margin-top: 6px; font-size: 10px; }
</style>
</head>
<body>
  <div class="logo-row"><span class="line"></span><img class="logo" src="${RECEIPT_LOGO_DATA_URI}" alt="" /><span class="line"></span></div>
  <div class="center store-name">${escapeHtml(STORE_NAME)}</div>
  <div class="center store-info">${escapeHtml(STORE_ADDRESS)}</div>
  <div class="center">Order #${escapeHtml(order.orderNo)} &middot; ${order.type === "DINE_IN" ? "Dine-in" : "Takeout"}</div>
  <div class="center small">${time}</div>
  <hr />
  ${itemsHtml}
  ${order.notes ? `<hr /><div>Note: ${escapeHtml(order.notes)}</div>` : ""}
  <hr />
  ${
    order.discountName && order.subtotal != null
      ? `<div class="item-row"><span>Subtotal</span><span>\u20B1${order.subtotal.toFixed(2)}</span></div>
  <div class="item-row"><span>${escapeHtml(order.discountName)} ${order.discountPercent ?? 0}%</span><span>-\u20B1${(order.discountAmount ?? 0).toFixed(2)}</span></div>`
      : ""
  }
  <div class="total-row"><span>TOTAL</span><span>\u20B1${order.total.toFixed(2)}</span></div>
  ${tenderedHtml}
  ${statusBlock}
  ${barcodeBlock}
  <div class="footer">We'll call your number when ready.<br/>${escapeHtml(RECEIPT_THANK_YOU)}</div>
</body>
</html>`;
}

/**
 * Builds the short slip printed at the COUNTER when staff confirm a
 * payment — order number (large) + what was ordered, nothing else. No
 * prices, no payment method, no barcode, no store header/footer: this
 * isn't a copy of the customer's receipt (that already printed at order
 * time), it's just enough for staff to glance at and match to the right
 * customer/queue slot. Mirrors the fields on printKitchenTicketRawBT.ts's
 * kitchen slip, just laid out as HTML for window.print() instead of a
 * hand-built PDF for RawBT.
 */
export function buildCounterConfirmationTicketHtml(order: OrderRecord) {
  const itemsHtml = order.items
    .map((item) => {
      const combo = orderItemComboContents(item);
      const comboLines =
        combo && combo.length
          ? combo.map((c) => `<div class="sub">${c.qty}x ${escapeHtml(c.name)}</div>`).join("")
          : "";
      return `<div class="item-row">${item.qty}x ${escapeHtml(orderItemName(item))}</div>${comboLines}`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 48mm;
    margin: 0 auto;
    padding: 2mm 1mm 4mm;
    font-family: "Courier New", monospace;
    color: #000;
  }
  .center { text-align: center; }
  .order-no { font-size: 26px; font-weight: bold; letter-spacing: 1px; }
  .type { font-size: 11px; margin-top: 2px; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .item-row { font-size: 13px; font-weight: bold; margin-top: 2px; }
  .sub { padding-left: 8px; font-size: 11px; font-weight: normal; }
  .paid { text-align: center; font-weight: bold; font-size: 12px; margin-top: 6px; }
</style>
</head>
<body>
  <div class="center order-no">#${escapeHtml(order.orderNo)}</div>
  <div class="center type">${order.type === "DINE_IN" ? "Dine-in" : "Takeout"}</div>
  <hr />
  ${itemsHtml}
  ${order.notes ? `<hr /><div>Note: ${escapeHtml(order.notes)}</div>` : ""}
  <div class="paid">PAID \u2713</div>
</body>
</html>`;
}

/**
 * Prints an HTML receipt document to whatever the browser's default
 * printer is, via a hidden iframe (so the visible kiosk UI never flashes
 * or navigates away). Waits for the barcode <img> to finish loading first
 * — printing before it loads is the most common cause of a blank barcode
 * on real hardware.
 */
export function printThermalReceipt(html: string) {
  if (typeof window === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      iframe.parentNode?.removeChild(iframe);
    }, 1000);
  };

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    const win = iframe.contentWindow;
    win?.focus();
    win?.print();
    cleanup();
  };

  const images = Array.from(doc.images);
  if (images.length === 0) {
    doPrint();
  } else {
    let settled = 0;
    const onOneSettled = () => {
      settled += 1;
      if (settled >= images.length) doPrint();
    };
    images.forEach((img) => {
      if (img.complete) onOneSettled();
      else {
        img.addEventListener("load", onOneSettled, { once: true });
        img.addEventListener("error", onOneSettled, { once: true });
      }
    });
  }
  // Safety net in case an image never fires load/error for some reason.
  setTimeout(doPrint, 2000);
}