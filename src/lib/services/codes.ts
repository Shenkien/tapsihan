import QRCode from "qrcode";
import bwipjs from "bwip-js/node";

/**
 * Generates a scannable QR code for an order as a PNG data URI, embeddable
 * directly in <img src="..." />. Used for the GCash digital receipt on the
 * QR (phone) ordering flow — the customer's own camera reads it.
 */
export async function generateOrderCodeDataUri(text: string) {
  return QRCode.toDataURL(text, { margin: 1, scale: 6 });
}

/**
 * Generates a real Code39 *linear* barcode as a PNG data URI — this is what
 * prints on the kiosk/counter cash ticket. Restores the original Express
 * app's `bwip-js` behavior; bwip-js is pure JS (no native canvas dependency)
 * so it runs fine in a Vercel serverless function.
 *
 * SYMBOLOGY IS DELIBERATE: Code39, confirmed against the actual hardware.
 * The comments here and at the call site in api/orders/route.ts used to say
 * "Code128" while the code said code39; the comments were the wrong half.
 * Do not "fix" this to code128 — that changes what physically prints.
 */
export async function generateBarcodeDataUri(text: string) {
  const png = await bwipjs.toBuffer({
    bcid: "code39", // Code39 — confirmed correct for this deployment's hardware
    text,
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: "center",
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}
