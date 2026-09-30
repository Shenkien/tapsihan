import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/orders/:orderNo/status — public, returns ONLY { status }.
// This is what the customer's receipt polls. The full endpoint
// (/api/orders/:orderNo) renders a barcode image on every call, which the
// poller ignores; with many waiting customers that was a lot of wasted work
// every few seconds. The full endpoint stays for the print bridge.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  if (!/^\d{4,10}$/.test(orderNo)) {
    return NextResponse.json({ error: "Invalid order number" }, { status: 400 });
  }
  try {
    const order = await prisma.order.findUnique({ where: { orderNo }, select: { status: true } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ status: order.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(`GET /api/orders/${orderNo}/status failed:`, err);
    return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  }
}
