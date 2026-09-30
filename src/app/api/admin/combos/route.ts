import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { notify } from "@/lib/pusher";
import { createComboSchema } from "@/lib/validations";
import { readJson } from "@/lib/api-helpers";

export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const combos = await prisma.comboMeal.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: { include: { product: { select: { id: true, name: true } } } } },
  });
  return NextResponse.json(combos);
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createComboSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { name, description, imageUrl, price, active, items } = parsed.data;

  // No @unique on ComboMeal.name in the schema, but every other create-item
  // route (Ingredients, Products, Suppliers) checks for a duplicate name
  // before saving — this one was missing that same guard.
  const existing = await prisma.comboMeal.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json({ error: `A combo named "${existing.name}" already exists.` }, { status: 409 });
  }

  // Each Menu Item can only appear once per combo (schema.prisma has a
  // @@unique([comboMealId, productId]) on ComboMealItem) — checked
  // explicitly here, same as the recipe route's duplicate-ingredient
  // guard, instead of letting the same item silently save twice as two
  // line items with different quantities.
  const seenProductIds = new Set<number>();
  const duplicateProductIds = new Set<number>();
  for (const item of items) {
    if (seenProductIds.has(item.productId)) duplicateProductIds.add(item.productId);
    seenProductIds.add(item.productId);
  }
  if (duplicateProductIds.size > 0) {
    return NextResponse.json(
      { error: "This combo lists the same menu item more than once. Each item can only appear once per combo." },
      { status: 400 }
    );
  }

  try {
    const combo = await prisma.comboMeal.create({
      data: {
        name,
        description,
        imageUrl,
        price,
        active: active ?? true,
        items: { create: items.map((i) => ({ productId: i.productId, qty: i.qty })) },
      },
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
    });
    // Same channel/event the kiosk already listens to for Menu Item changes
    // (products, categories, ingredients) — a new combo should show up on an
    // open kiosk/QR tab without a manual reload just like those do.
    await notify("menu:updated", {});
    return NextResponse.json(combo, { status: 201 });
  } catch (err) {
    // Duplicate items are already caught above, but this is a fallback —
    // same reasoning as the recipe route: an uncaught P2002/P2003 here
    // would otherwise crash the client with an empty error body.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "This combo lists the same menu item more than once. Each item can only appear once per combo." },
        { status: 400 }
      );
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: "One of these menu items no longer exists. Refresh the page and try again." },
        { status: 400 }
      );
    }
    console.error("Failed to create combo:", err);
    return NextResponse.json({ error: "Could not create combo. Please try again." }, { status: 500 });
  }
}
