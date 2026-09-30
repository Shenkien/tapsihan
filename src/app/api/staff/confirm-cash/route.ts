import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readJson, toErrorResponse } from "@/lib/api-helpers";
import { confirmCashSchema } from "@/lib/validations";
import { markOrderPaid } from "@/lib/services/paymentFlow";

// POST /api/staff/confirm-cash  { orderNo, amountReceived }
// All checks, the atomic status flip, the Payment row, the audit entry, the
// prints and the realtime events live in markOrderPaid (lib/services/paymentFlow.ts).
export async function POST(req: NextRequest) {
  const session = await requireRole(["STAFF", "ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = confirmCashSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const order = await markOrderPaid(parsed.data.orderNo, {
      method: "CASH",
      actorId: Number(session.user.id),
      actorName: session.user.name ?? session.user.username,
      amountReceived: parsed.data.amountReceived,
    });
    return NextResponse.json({ order, payment: order.payment });
  } catch (err) {
    return toErrorResponse(err);
  }
}
