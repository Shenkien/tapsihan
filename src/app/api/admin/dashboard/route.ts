import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { soldBetween, startOfDayPH } from "@/lib/time";
import { sumPesos, toCentavos } from "@/lib/money";

/** How far below its reorder level an ingredient is (0 = empty, 1 = at the level). */
function lowRatio(i: { trackByPiece: boolean; pieceStock: number; stock: number; lowStockThreshold: number; piecesPerUnit: number }) {
  const level = i.trackByPiece ? i.lowStockThreshold * (i.piecesPerUnit || 1) : i.lowStockThreshold;
  const have = i.trackByPiece ? i.pieceStock : i.stock;
  return level > 0 ? have / level : have;
}

// GET /api/admin/dashboard — today's sales, top items, low stock
export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Philippine calendar day, booked by when the order was PAID (a cash order
  // created at 11:58 pm and paid the next morning belongs to the next day).
  const since = startOfDayPH(0);

  const todaysOrders = await prisma.order.findMany({
    where: { ...soldBetween(since), status: { notIn: ["CREATED", "CANCELLED"] } },
    include: { items: true },
  });

  // Same statuses, but for the matching window a day earlier (start of
  // yesterday up to this same time yesterday), so the comparison is fair
  // even though today is only partly over.
  const yesterdayStart = startOfDayPH(1);
  const yesterdayEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdaysOrders = await prisma.order.findMany({
    where: { ...soldBetween(yesterdayStart, yesterdayEnd), status: { notIn: ["CREATED", "CANCELLED"] } },
    select: { total: true },
  });
  const yesterday = {
    revenue: sumPesos(yesterdaysOrders.map((o) => o.total)),
    orderCount: yesterdaysOrders.length,
  };

  const revenue = sumPesos(todaysOrders.map((o) => o.total));
  const orderCount = todaysOrders.length;
  const byMethod = { CASH: 0, GCASH: 0 };
  for (const o of todaysOrders) byMethod[o.paymentMethod] += toCentavos(o.total);
  byMethod.CASH /= 100;
  byMethod.GCASH /= 100;

  const itemTotals = new Map<number, number>();
  for (const o of todaysOrders) {
    for (const item of o.items) {
      // Combo meal lines have productId === null (they use comboMealId
      // instead); this tally is product-only, so skip those lines.
      if (item.productId === null) continue;
      const productId = item.productId;
      itemTotals.set(productId, (itemTotals.get(productId) || 0) + item.qty);
    }
  }
  const topProductIds = [...itemTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topProducts = await prisma.product.findMany({
    where: { id: { in: topProductIds.map(([id]) => id) } },
  });
  const topItems = topProductIds.map(([id, qty]) => ({
    product: topProducts.find((p) => p.id === id),
    qtySold: qty,
  }));

  const allIngredients = await prisma.ingredient.findMany({
    where: { active: true },
    include: { supplier: { select: { id: true, name: true } } },
  });
  // lowStockThreshold is always entered in the purchase unit (e.g. "Reorder
  // at: 5 pack"), so for a trackByPiece ingredient it has to be converted to
  // pieces before comparing against pieceStock — comparing it directly
  // against pieceStock (or worse, only checking pieceStock <= 0) meant the
  // threshold the admin set had no effect and the alert only ever fired once
  // an item hit exactly zero pieces.
  const lowIngredients = allIngredients
    .filter((i) =>
      i.trackByPiece
        ? i.pieceStock < i.lowStockThreshold * (i.piecesPerUnit || 1)
        : i.stock < i.lowStockThreshold
    )
    // Lowest first, judged against the pool that is actually used and the
    // reorder level, so a piece-tracked item isn't ranked by its weight stock.
    .sort((a, b) => lowRatio(a) - lowRatio(b));

  return NextResponse.json({ revenue, orderCount, yesterday, byMethod, topItems, lowIngredients });
}