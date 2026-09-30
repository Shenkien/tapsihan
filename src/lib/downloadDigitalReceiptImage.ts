"use client";

import { orderItemComboContents, orderItemName, type OrderRecord } from "@/types/models";
import { STORE_NAME, STORE_ADDRESS, RECEIPT_THANK_YOU } from "@/lib/storeInfo";

/**
 * "Screenshot"-style download for the QR digital receipt.
 *
 * WHY CANVAS INSTEAD OF html2canvas: that's the usual way to turn a styled
 * DOM node into an image, but it's not in package.json and this environment
 * can't run `npm install` to add it. jsPDF is already a dependency (see
 * printThermalRawBT.ts) but its built-in fonts can't render "₱" without
 * embedding a custom font. The 2D Canvas API is built into every browser,
 * uses the device's own system font (so ₱ renders fine), and needs nothing
 * new installed — it just draws the same content by hand, the same way
 * printThermalRawBT.ts hand-draws the thermal ticket in jsPDF.
 *
 * Output is a PNG sized like a tall receipt strip, drawn at 2x scale so it
 * stays crisp on a phone's retina screen, then downloaded via a temporary
 * <a download> link — the standard way to save a Blob without a server
 * round-trip.
 */

const WIDTH = 380;
const SCALE = 2;
const PAD = 24;
const CONTENT_WIDTH = WIDTH - PAD * 2;

const ITEM_FONT = "15px sans-serif";
const COMBO_FONT = "12px sans-serif";
const NOTE_FONT = "italic 13px sans-serif";

/**
 * Breaks `text` into as many lines as it takes to fit inside `maxWidth` at the
 * given font. Continuation lines are prefixed with `indent` so a wrapped item
 * name stays visually hanging under its own quantity instead of restarting at
 * the left margin. A single word longer than the line (e.g. a pasted string
 * with no spaces) is split character-by-character so it can never overflow.
 *
 * Without this, fillText() just draws past the right edge of the canvas and
 * the overflow is silently clipped — no error, so a customer's saved receipt
 * would quietly be missing part of what they ordered.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number,
  indent = ""
): string[] {
  const prev = ctx.font;
  ctx.font = font;

  const lines: string[] = [];
  let line = "";

  const push = () => {
    if (line) lines.push(line);
    line = "";
  };

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const prefix = lines.length === 0 ? "" : indent;
    const candidate = line ? `${line} ${word}` : `${prefix}${word}`;

    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    push();

    // The word alone still doesn't fit — hard-split it.
    let chunk = lines.length === 0 ? "" : indent;
    for (const ch of word) {
      if (ctx.measureText(chunk + ch).width > maxWidth && chunk.trim()) {
        lines.push(chunk);
        chunk = indent + ch;
      } else {
        chunk += ch;
      }
    }
    line = chunk;
  }
  push();

  ctx.font = prev;
  return lines.length ? lines : [""];
}

export async function downloadDigitalReceiptImage(
  order: OrderRecord,
  opts: { paid: boolean; cancelled?: boolean }
) {
  if (typeof window === "undefined") return;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // LAYOUT PASS — measure everything variable-length *before* sizing the
  // canvas, because a canvas can't reflow once drawn. Height is then exact
  // rather than a guess, and nothing can run off the right edge either.
  type Block =
    | { kind: "item"; lines: string[] }
    | { kind: "combo"; lines: string[] };

  const blocks: Block[] = [];
  let bodyHeight = 0;

  for (const item of order.items) {
    const lines = wrapText(ctx, `${item.qty}x ${orderItemName(item)}`, ITEM_FONT, CONTENT_WIDTH, "   ");
    blocks.push({ kind: "item", lines });
    bodyHeight += lines.length * 21;

    const combo = orderItemComboContents(item);
    if (combo && combo.length) {
      for (const c of combo) {
        const cl = wrapText(ctx, `${c.qty}x ${c.name}`, COMBO_FONT, CONTENT_WIDTH - 18, "  ");
        blocks.push({ kind: "combo", lines: cl });
        bodyHeight += cl.length * 15;
      }
    }
  }

  const noteLines = order.notes
    ? wrapText(ctx, `Note: ${order.notes}`, NOTE_FONT, CONTENT_WIDTH, "")
    : [];
  if (noteLines.length) bodyHeight += 6 + noteLines.length * 18 + 2;

  const height = 260 + bodyHeight;

  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);

  const divider = (y: number) => {
    ctx.strokeStyle = "#e2ddd3";
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(WIDTH - 24, y);
    ctx.stroke();
  };

  let y = 36;
  ctx.textAlign = "center";
  ctx.fillStyle = "#1c1c1c";
  ctx.font = "bold 17px sans-serif";
  ctx.fillText(STORE_NAME, WIDTH / 2, y);
  y += 20;

  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#6b6b6b";
  ctx.fillText(STORE_ADDRESS, WIDTH / 2, y);
  y += 24;

  ctx.font = "bold 24px sans-serif";
  ctx.fillStyle = "#1c1c1c";
  ctx.fillText(`Order #${order.orderNo}`, WIDTH / 2, y);
  y += 22;

  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#6b6b6b";
  ctx.fillText(order.type === "DINE_IN" ? "Dine-in" : "Takeout", WIDTH / 2, y);
  y += 22;

  divider(y);
  y += 26;

  ctx.textAlign = "left";
  for (const block of blocks) {
    if (block.kind === "item") {
      ctx.font = ITEM_FONT;
      ctx.fillStyle = "#1c1c1c";
      for (const line of block.lines) {
        ctx.fillText(line, PAD, y);
        y += 21;
      }
    } else {
      ctx.font = COMBO_FONT;
      ctx.fillStyle = "#8a8a8a";
      for (const line of block.lines) {
        ctx.fillText(`   ${line}`, PAD, y);
        y += 15;
      }
    }
  }

  if (noteLines.length) {
    y += 6;
    ctx.font = NOTE_FONT;
    ctx.fillStyle = "#5a5a5a";
    for (const line of noteLines) {
      ctx.fillText(line, PAD, y);
      y += 18;
    }
    y += 2;
  }

  y += 4;
  divider(y);
  y += 30;

  ctx.textAlign = "left";
  ctx.fillStyle = "#1c1c1c";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("Total", 24, y);
  ctx.textAlign = "right";
  ctx.fillText(`\u20b1${order.total.toFixed(0)}`, WIDTH - 24, y);
  y += 34;

  ctx.textAlign = "center";
  ctx.font = "bold 14px sans-serif";
  ctx.fillStyle = opts.cancelled ? "#b3261e" : opts.paid ? "#1a7f37" : "#a15c00";
  ctx.fillText(
    opts.cancelled
      ? "CANCELLED"
      : opts.paid
        ? "PAID"
        : order.paymentMethod === "CASH"
          ? "Pay at the counter"
          : "Waiting for payment",
    WIDTH / 2,
    y
  );
  y += 22;

  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#9a9a9a";
  ctx.fillText("We'll call your number when ready.", WIDTH / 2, y);
  y += 16;
  ctx.fillText(RECEIPT_THANK_YOU, WIDTH / 2, y);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `receipt-${order.orderNo}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
