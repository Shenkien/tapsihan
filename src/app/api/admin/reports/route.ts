import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { hourPH, soldBetween, startOfDayPH } from "@/lib/time";
import { lineCentavos, roundPeso, sumPesos, toCentavos } from "@/lib/money";

// GET /api/admin/reports?period=daily|weekly
export async function GET(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const periodParam = searchParams.get("period");
  const period = periodParam === "weekly" ? 7 : 1;
  // Calendar days in Philippine time, same as the dashboard: "daily" is today
  // since 00:00, "weekly" is today plus the 6 days before it.
  const since = startOfDayPH(period - 1);

  const orders = await prisma.order.findMany({
    where: { ...soldBetween(since), status: { notIn: ["CREATED", "CANCELLED"] } },
    include: { items: { include: { product: true, comboMeal: true } } },
  });

  const revenue = sumPesos(orders.map((o) => o.total));
  const avgOrderValue = orders.length ? roundPeso(revenue / orders.length) : 0;

  // Added in whole centavos, converted back to pesos once at the end.
  const byMethodC = { CASH: 0, GCASH: 0 };
  for (const o of orders) byMethodC[o.paymentMethod] += toCentavos(o.total);
  const byMethod = { CASH: byMethodC.CASH / 100, GCASH: byMethodC.GCASH / 100 };

  const byTypeC = { DINE_IN: 0, TAKEOUT: 0 };
  for (const o of orders) byTypeC[o.type] += toCentavos(o.total);
  const byType = { DINE_IN: byTypeC.DINE_IN / 100, TAKEOUT: byTypeC.TAKEOUT / 100 };

  const byChannelC = { KIOSK: 0, QR: 0, COUNTER: 0 };
  for (const o of orders) byChannelC[o.source] += toCentavos(o.total);
  const byChannel = { KIOSK: byChannelC.KIOSK / 100, QR: byChannelC.QR / 100, COUNTER: byChannelC.COUNTER / 100 };

  // Which hour of day (0-23, Philippine time), by when it was paid, has seen the most orders —
  // a quick signal for staffing the counter/kitchen during the busiest slot.
  const byHour = new Array(24).fill(0);
  for (const o of orders) byHour[hourPH(o.paidAt ?? o.createdAt)]++;
  const peakHour = orders.length ? byHour.indexOf(Math.max(...byHour)) : null;

  // A combo line is named after the ComboMeal, not a Product — sold as
  // one bundle, so it shows up in this breakdown as its own row rather
  // than being split back out into its component items.
  const byItem = new Map<string, { qty: number; revenue: number }>(); // revenue in centavos until the response
  for (const o of orders) {
    for (const item of o.items) {
      const key = item.comboMeal ? `${item.comboMeal.name} (Combo)` : item.product?.name ?? "Item";
      const cur = byItem.get(key) || { qty: 0, revenue: 0 };
      cur.qty += item.qty;
      cur.revenue += lineCentavos(item.unitPrice, item.qty);
      byItem.set(key, cur);
    }
  }

  return NextResponse.json({
    period: periodParam === "weekly" ? "weekly" : "daily",
    revenue,
    orderCount: orders.length,
    avgOrderValue,
    byMethod,
    byType,
    byChannel,
    peakHour,
    byItem: Object.fromEntries(
      Array.from(byItem, ([name, v]) => [name, { qty: v.qty, revenue: v.revenue / 100 }])
    ),
  });
}
