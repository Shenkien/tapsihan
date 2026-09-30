import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createProductSchema } from "@/lib/validations";
import { notify } from "@/lib/pusher";
import { readJson } from "@/lib/api-helpers";

export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const products = await prisma.product.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { recipeItems: true } } },
  });
  const withRecipeCount = products.map(({ _count, ...p }) => ({ ...p, recipeItemCount: _count.recipeItems }));
  return NextResponse.json(withRecipeCount);
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createProductSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { name, category, price, cost, imageUrl, description, bestSeller, isNew, active } = parsed.data;

  // Same item, same category, already on the menu — creating another row
  // for it is what causes it to show up as separate duplicate tiles on the
  // kiosk (and lets its stock drift out of sync across the copies).
  const existing = await prisma.product.findFirst({
    where: {
      active: true,
      category: { equals: category, mode: "insensitive" },
      name: { equals: name, mode: "insensitive" },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: `"${existing.name}" already exists in ${existing.category}.` },
      { status: 409 }
    );
  }

  const product = await prisma.product.create({
    data: {
      name,
      category,
      price,
      cost: cost ?? 0,
      imageUrl,
      description,
      bestSeller,
      isNew,
      active,
    },
  });
  await notify("menu:updated", {});
  return NextResponse.json(product, { status: 201 });
}
