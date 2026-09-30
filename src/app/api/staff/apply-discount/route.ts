import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { applyDiscountSchema } from "@/lib/validations";
import { readJson } from "@/lib/api-helpers";
import { logAudit } from "@/lib/services/audit";
import { computeDiscount, orderSubtotal } from "@/lib/services/discounts";
import { notify } from "@/lib/pusher";

// POST /api/staff/apply-discount  { orderNo, discountId | null }
//
// Puts a discount on (or takes it off) an order that hasn't been paid yet.
// The percentage always comes from the Discount row the admin maintains —
// never from the request — and the new total is worked out here from the
// order's own lines, so a browser can't invent an amount. confirm-cash and
// confirm-gcash then simply use the updated order.total.
export async function POST(req: NextRequest) {
  const session = await requireRole(["STAFF", "ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = applyDiscountSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { orderNo, discountId } = parsed.data;

  const order = await prisma.order.findUnique({ where: { orderNo }, include: { items: true } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "CREATED") {
    return NextResponse.json({ error: "Discounts can only be changed before the order is paid." }, { status: 400 });
  }

  const subtotal = orderSubtotal(order.items);
  const actorName = session.user.name ?? session.user.username ?? "Unknown";
  const actorId = Number(session.user.id);

  let data: {
    total: number;
    subtotal: number | null;
    discountName: string | null;
    discountPercent: number;
    discountAmount: number;
  };
  let auditText: string;

  if (discountId === null) {
    data = {
      total: subtotal,
      subtotal: null,
      discountName: null,
      discountPercent: 0,
      discountAmount: 0,
    };
    auditText = `Removed the discount from order #${order.orderNo}`;
  } else {
    const discount = await prisma.discount.findUnique({ where: { id: discountId } });
    if (!discount || !discount.active) {
      return NextResponse.json({ error: "That discount isn't available." }, { status: 400 });
    }
    const { discountAmount, total } = computeDiscount(subtotal, discount.percent);
    data = {
      total,
      subtotal,
      discountName: discount.name,
      discountPercent: discount.percent,
      discountAmount,
    };
    auditText = `Applied ${discount.name} ${discount.percent}% to order #${order.orderNo}: ₱${subtotal.toFixed(2)} → ₱${total.toFixed(2)}`;
  }

  // Scoped to CREATED so a payment confirmed a moment ago can't be re-priced.
  const { count } = await prisma.order.updateMany({ where: { id: order.id, status: "CREATED" }, data });
  if (count === 0) {
    return NextResponse.json({ error: "This order was just paid — its total can't change any more." }, { status: 409 });
  }

  await logAudit({
    action: discountId === null ? "order.discount_removed" : "order.discount_applied",
    entityType: "Order",
    entityId: order.id,
    description: auditText,
    actorName,
    actorId,
  });

  const updated = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: { include: { product: true, comboMeal: true } }, payment: true },
  });
  await notify("staff:queue-updated", {});
  return NextResponse.json({ order: updated });
}
