import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { startOfTodayPH } from "@/lib/time";
import { expireStaleOrders } from "@/lib/services/orderCancel";

// GET /api/staff/queue — all active orders, plus today's completed orders
// (shown as the "Order Done" history list), oldest first.
export async function GET() {
  const session = await requireRole(["STAFF", "ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Clear out abandoned unpaid orders (30 min+) so they don't clutter "Awaiting Payment".
  await expireStaleOrders(10).catch((e) => console.error("expireStaleOrders failed:", e));

  // Philippine midnight, not the server's (UTC on Vercel).
  const startOfToday = startOfTodayPH();

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { status: { in: ["CREATED", "PAID"] } },
        { status: "COMPLETED", completedAt: { gte: startOfToday } },
      ],
    },
    // Staff only need names here: selecting the whole Product would send its cost/stock too.
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true } },
          comboMeal: { select: { id: true, name: true } },
        },
      },
      payment: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(orders);
}
