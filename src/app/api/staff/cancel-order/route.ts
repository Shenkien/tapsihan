import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { notify } from "@/lib/pusher";
import { readJson, toErrorResponse } from "@/lib/api-helpers";
import { cancelOrder } from "@/lib/services/orderCancel";
import { orderIdSchema } from "@/lib/validations";

// POST /api/staff/cancel-order  { orderId }
// Declines an order that hasn't been picked up yet (the "✕" button). Once an
// order is COMPLETED it can no longer be cancelled from here. The work (status
// flip + returning reserved ingredient stock) lives in cancelOrder() so the
// expiry job uses exactly the same code.
export async function POST(req: NextRequest) {
  const session = await requireRole(["STAFF", "ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = orderIdSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const updated = await cancelOrder(parsed.data.orderId, {
      actor: { id: Number(session.user.id) || undefined, name: session.user.name ?? session.user.username ?? "staff" },
    });
    await notify("staff:queue-updated", {});
    return NextResponse.json({ order: { ...updated, status: "CANCELLED" } });
  } catch (err) {
    return toErrorResponse(err);
  }
}
