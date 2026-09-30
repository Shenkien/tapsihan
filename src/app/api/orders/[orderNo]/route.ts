import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBarcodeDataUri } from "@/lib/services/codes";

// GET /api/orders/:orderNo — public (unauthenticated) order lookup, used by
// the QR digital receipt's status poll in usePayment.ts, and by the Android
// print-bridge page (src/app/print-bridge/page.tsx) to fetch an order's
// full detail + barcode image before printing it.
//
// Order numbers are short and sequential, so anyone can guess another
// customer's. That's acceptable for what a receipt shows, but the handler
// used to `include: { items: { include: { product: true } }, payment: true }`,
// which sends the *whole* Product row — including `cost` and `stock` — to any
// caller. That's internal margin/inventory data leaking out of a public
// endpoint. Everything below is selected explicitly to match OrderRecord in
// types/models.ts, which is all the client ever reads.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> }
) {
  const { orderNo } = await params;
  if (!/^\d{4,10}$/.test(orderNo)) {
    return NextResponse.json({ error: "Invalid order number" }, { status: 400 });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { orderNo },
      select: {
        id: true,
        orderNo: true,
        barcode: true,
        type: true,
        source: true,
        total: true,
        // Discount summary for the receipt.
        subtotal: true,
        discountName: true,
        discountPercent: true,
        discountAmount: true,
        notes: true,
        paymentMethod: true,
        status: true,
        createdAt: true,
        paidAt: true,
        receivedAt: true,
        readyAt: true,
        completedAt: true,
        items: {
          select: {
            id: true,
            qty: true,
            notes: true,
            unitPrice: true,
            comboItemsSnapshot: true,
            product: { select: { id: true, name: true } },
            comboMeal: { select: { id: true, name: true } },
          },
        },
        payment: {
          select: {
            id: true,
            method: true,
            reference: true,
            amountReceived: true,
            change: true,
            status: true,
            paidAt: true,
          },
        },
      },
    });

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // barcodeImage is generated on the fly rather than stored — same as
    // the order-creation route — since it's cheap and keeps this endpoint's
    // response self-contained for the print-bridge page.
    const barcodeImage = await generateBarcodeDataUri(order.barcode);
    return NextResponse.json({ order, barcodeImage });
  } catch (err) {
    // Same reasoning as GET /api/products: without this, a DB error throws out
    // of the handler and the poll's `res.json()` fails on an empty body.
    console.error(`GET /api/orders/${orderNo} failed:`, err);
    return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  }
}
