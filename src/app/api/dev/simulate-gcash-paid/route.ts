import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, toErrorResponse } from "@/lib/api-helpers";
import { markOrderPaid } from "@/lib/services/paymentFlow";
import { simulateGcashPaidSchema } from "@/lib/validations";

// POST /api/dev/simulate-gcash-paid  { orderNo }
// Local-testing stand-in for "staff confirmed the GCash payment".
export async function POST(req: NextRequest) {
  // Real GCash payments are confirmed by staff against the static QR, so this
  // endpoint must never be reachable by customers in production.
  // ALLOW_PAYMENT_SIMULATION is the "local dev testing only" switch; it has to
  // be turned on explicitly.
  if (process.env.ALLOW_PAYMENT_SIMULATION !== "true") {
    return NextResponse.json({ error: "Payment simulation is disabled" }, { status: 403 });
  }

  const parsed = simulateGcashPaidSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const existing = await prisma.order.findUnique({
      where: { orderNo: parsed.data.orderNo },
      select: { total: true },
    });
    if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const order = await markOrderPaid(parsed.data.orderNo, {
      method: "GCASH",
      actorName: "dev-simulate",
      amountReceived: existing.total,
    });
    return NextResponse.json({ order });
  } catch (err) {
    return toErrorResponse(err);
  }
}
