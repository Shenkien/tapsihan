import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { ensureDefaultDiscounts } from "@/lib/services/discounts";

// GET /api/staff/discounts — the discounts the counter can pick from.
export async function GET() {
  const session = await requireRole(["STAFF", "ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDefaultDiscounts();
  const discounts = await prisma.discount.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, percent: true },
  });
  return NextResponse.json(discounts);
}
