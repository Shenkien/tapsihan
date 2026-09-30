import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createDiscountSchema } from "@/lib/validations";
import { readJson } from "@/lib/api-helpers";
import { logAudit } from "@/lib/services/audit";
import { ensureDefaultDiscounts } from "@/lib/services/discounts";

// GET /api/admin/discounts — every discount, active or not.
export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDefaultDiscounts();
  const discounts = await prisma.discount.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(discounts);
}

// POST /api/admin/discounts  { name, percent }
export async function POST(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createDiscountSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { name, percent } = parsed.data;

  const clash = await prisma.discount.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (clash) return NextResponse.json({ error: `"${clash.name}" already exists.` }, { status: 409 });

  try {
    const discount = await prisma.discount.create({ data: { name, percent } });
    await logAudit({
      action: "discount.create",
      entityType: "Discount",
      entityId: discount.id,
      description: `Added discount "${name}" (${percent}%)`,
      actorName: session.user.name ?? session.user.username ?? "Unknown",
      actorId: Number(session.user.id),
    });
    return NextResponse.json(discount, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That discount already exists." }, { status: 409 });
    }
    console.error("Failed to create discount:", err);
    return NextResponse.json({ error: "Could not add discount. Please try again." }, { status: 500 });
  }
}
