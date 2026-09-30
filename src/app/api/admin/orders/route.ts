import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

// GET /api/admin/orders?from=&to=&status=&paymentMethod=&source=&paymentStatus=&search=
export async function GET(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");
  const paymentMethod = searchParams.get("paymentMethod");
  const source = searchParams.get("source");
  const paymentStatus = searchParams.get("paymentStatus");
  const search = searchParams.get("search");

  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status as Prisma.OrderWhereInput["status"];
  if (paymentMethod) where.paymentMethod = paymentMethod as Prisma.OrderWhereInput["paymentMethod"];
  if (source) where.source = source as Prisma.OrderWhereInput["source"];
  if (search) where.orderNo = { contains: search, mode: "insensitive" };
  if (paymentStatus === "paid") where.payment = { is: { paidAt: { not: null } } };
  if (paymentStatus === "unpaid") where.payment = { is: { paidAt: null } };
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
    if (to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(to);
  }

  const orders = await prisma.order.findMany({
    where,
    include: { items: { include: { product: true, comboMeal: true } }, payment: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(orders);
}
