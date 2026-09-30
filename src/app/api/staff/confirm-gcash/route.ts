import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readJson, toErrorResponse } from "@/lib/api-helpers";
import { confirmGcashSchema } from "@/lib/validations";
import { markOrderPaid } from "@/lib/services/paymentFlow";

// POST /api/staff/confirm-gcash  { orderNo, gcashRef, amountReceived }
//
// The store's GCash QR at checkout is a static merchant code (see
// GET /api/payments/gcash-qr): the customer sends money to it from their own
// GCash app, and nothing tells the server it happened. Staff check the
// payment in the GCash app and confirm it here. Because the QR carries no
// order number, staff must also type the real GCash reference number and the
// amount that was actually received — markOrderPaid rejects an amount below
// the total and a reference number that was already used on another order.
export async function POST(req: NextRequest) {
  const session = await requireRole(["STAFF", "ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = confirmGcashSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const order = await markOrderPaid(parsed.data.orderNo, {
      method: "GCASH",
      actorId: Number(session.user.id),
      actorName: session.user.name ?? session.user.username,
      amountReceived: parsed.data.amountReceived,
      gcashRef: parsed.data.gcashRef,
    });
    return NextResponse.json({ order, payment: order.payment });
  } catch (err) {
    return toErrorResponse(err);
  }
}
