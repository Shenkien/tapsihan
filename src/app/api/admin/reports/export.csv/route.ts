import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { csvField } from "@/lib/csv";

// GET /api/admin/reports/export.csv?from=&to=
export async function GET(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Prisma.OrderWhereInput = { status: { notIn: ["CREATED", "CANCELLED"] } };
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
    if (to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(to);
  }

  const orders = await prisma.order.findMany({
    where,
    include: { items: { include: { product: true, comboMeal: true } } },
    orderBy: { createdAt: "asc" },
  });

  const rows = ["orderNo,type,source,paymentMethod,status,total,discount,discountAmount,createdAt,items"];
  for (const o of orders) {
    const itemsStr = o.items
      .map((i) => `${i.qty}x ${i.comboMeal ? `${i.comboMeal.name} (Combo)` : i.product?.name ?? "Item"}`)
      .join(" | ");
    rows.push(
      [o.orderNo, o.type, o.source, o.paymentMethod, o.status, o.total, csvField(o.discountName ?? ""), o.discountAmount, o.createdAt.toISOString(), csvField(itemsStr)].join(",")
    );
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=sales-report.csv",
    },
  });
}
