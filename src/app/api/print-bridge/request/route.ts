import { NextRequest, NextResponse } from "next/server";
import { notify } from "@/lib/pusher";
import { prisma } from "@/lib/prisma";
import { readJson } from "@/lib/api-helpers";
import { clientIp } from "@/lib/auth-throttle";
import { printRateLimited } from "@/lib/print-throttle";

// POST /api/print-bridge/request
// body: { orderNo: string }   (a legacy `variant` field is accepted but ignored)
//
// Devices that can't talk to RawBT directly (the iPad kiosk, which has no
// Bluetooth pairing to the PT-210) call this instead of printing locally.
// It doesn't touch a printer itself — it just broadcasts a
// "receipt:print-requested" event on the shared Pusher "orders" channel.
// The Android phone running /print-bridge is the one actually listening
// for that event and printing via RawBT. See printThermalRawBT.ts and
// src/app/print-bridge/page.tsx for the rest of this flow.
//
// This route isn't behind auth (see proxy.ts) — the kiosk itself is
// unauthenticated, so it can't be — which means the caller can't be trusted
// with anything that matters. In particular the caller does NOT get to say
// which receipt to print: the variant is worked out here from the order's real
// status, so nobody can make the printer output a "PAID" receipt for an
// unpaid order. On top of that: only orders created in the last 30 minutes are
// eligible, and requests are rate-limited per order and per address.
const REPRINT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(req: NextRequest) {
  const b = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const orderNo = typeof b.orderNo === "string" && /^\d{4,10}$/.test(b.orderNo) ? b.orderNo : null;
  if (!orderNo) {
    return NextResponse.json({ error: "orderNo is required" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { orderNo },
    select: { createdAt: true, status: true, paymentMethod: true },
  });
  if (!order || Date.now() - order.createdAt.getTime() > REPRINT_WINDOW_MS) {
    return NextResponse.json({ error: "Order not eligible for a print request" }, { status: 404 });
  }

  const variant =
    order.status === "CANCELLED"
      ? null
      : order.status === "CREATED"
        ? order.paymentMethod === "CASH"
          ? "cash-pending"
          : "gcash-pending"
        : "paid";
  if (!variant) {
    return NextResponse.json({ error: "Order not eligible for a print request" }, { status: 400 });
  }

  // 5 prints per order and 30 per address in 10 minutes: plenty for a jammed
  // printer and a few retries, far too little to burn a roll of paper.
  if (await printRateLimited({ orderNo, ip: clientIp(req.headers), perOrder: 5, perIp: 30 })) {
    return NextResponse.json({ error: "Too many print requests. Please wait a few minutes." }, { status: 429 });
  }

  await notify("receipt:print-requested", { orderNo, variant });
  return NextResponse.json({ ok: true, variant });
}
