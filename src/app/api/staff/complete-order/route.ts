import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { notify } from "@/lib/pusher";
import { orderIdSchema } from "@/lib/validations";
import { readJson } from "@/lib/api-helpers";

// POST /api/staff/complete-order  { orderId }
// Staff hit this the moment the customer actually takes the food — straight
// from PAID (in the kitchen) to COMPLETED. There's no separate "ready" step.
export async function POST(req: NextRequest) {
  const session = await requireRole(["STAFF", "ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = orderIdSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { orderId } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "PAID") {
    return NextResponse.json({ error: "Only orders in the kitchen (PAID) can be completed" }, { status: 400 });
  }

  // Same atomic-guard pattern as confirm-cash/confirm-gcash/cancel-order:
  // the status check above reads an unlocked snapshot, so two
  // near-simultaneous "complete" taps for the same order could both pass
  // it. Scoping this UPDATE's WHERE clause to `status: "PAID"` makes the
  // check-and-set atomic.
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: "PAID" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (count === 0) {
    return NextResponse.json({ error: "Order status changed — please refresh and try again" }, { status: 409 });
  }

  const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  await notify("staff:queue-updated", {});

  return NextResponse.json({ order: updated });
}
