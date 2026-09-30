import { NextRequest, NextResponse } from "next/server";
import { notify } from "@/lib/pusher";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { readJson } from "@/lib/api-helpers";
import { clientIp } from "@/lib/auth-throttle";
import { printRateLimited } from "@/lib/print-throttle";

// POST /api/print-bridge/kitchen/request
// body: { orderNo: string }
//
// Called by staff, manually, via the "Reprint Kitchen Ticket" button on an
// in-kitchen order card (StaffScreen.tsx) — for when the kitchen printer
// jammed, ran out of paper, or the first ticket got lost.
//
// The FIRST kitchen ticket does not come through here: the server fires the
// "kitchen-ticket:print-requested" event itself the instant an order flips to
// PAID (see markOrderPaid in lib/services/paymentFlow.ts). That is why this
// route can require a signed-in STAFF/ADMIN session — before, anyone who
// knew an order number could re-trigger a kitchen ticket (duplicate food).
//
// This route doesn't touch a printer itself — same pattern as
// /api/print-bridge/request for the customer receipt — it just broadcasts
// a "kitchen-ticket:print-requested" event on the shared Pusher "orders"
// channel. Whatever device is sitting on /print-bridge/kitchen (paired via
// RawBT to the KITCHEN's own printer, separate from the counter/kiosk
// printer) is the one actually listening and printing — see
// printKitchenTicketRawBT.ts and src/app/print-bridge/kitchen/page.tsx.
//
// On top of the login it is scoped to orders that were paid recently and
// limited to 5 reprints per order per 10 minutes.
const REPRINT_WINDOW_MS = 60 * 60 * 1000; // 1 hour — generous vs. the receipt's 30 min, since a kitchen ticket may legitimately need reprinting well after the order was placed

export async function POST(req: NextRequest) {
  const session = await requireRole(["STAFF", "ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const orderNo = typeof b.orderNo === "string" && /^\d{4,10}$/.test(b.orderNo) ? b.orderNo : null;

  if (!orderNo) {
    return NextResponse.json({ error: "orderNo is required" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { orderNo },
    select: { status: true, paidAt: true, createdAt: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  // Only a PAID (or already further along) order has a kitchen ticket to
  // reprint at all — an unpaid order was never sent to the kitchen in the
  // first place (see StaffScreen.tsx's "Awaiting Payment" section).
  if (order.status === "CREATED" || order.status === "CANCELLED") {
    return NextResponse.json({ error: "This order was never sent to the kitchen" }, { status: 400 });
  }
  const anchor = order.paidAt ?? order.createdAt;
  if (Date.now() - anchor.getTime() > REPRINT_WINDOW_MS) {
    return NextResponse.json({ error: "Order not eligible for a kitchen reprint" }, { status: 404 });
  }

  if (await printRateLimited({ orderNo, ip: clientIp(req.headers), perOrder: 5 })) {
    return NextResponse.json({ error: "Too many reprints for this order. Please wait a few minutes." }, { status: 429 });
  }

  await notify("kitchen-ticket:print-requested", { orderNo });
  return NextResponse.json({ ok: true });
}
