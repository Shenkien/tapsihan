import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { notify } from "@/lib/pusher";
import { updateComboSchema } from "@/lib/validations";
import { invalidIdResponse, readJson } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;
  const combo = await prisma.comboMeal.findUnique({
    where: { id: Number(id) },
    include: { items: { include: { product: { select: { id: true, name: true } } } } },
  });
  if (!combo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(combo);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;
  const parsed = updateComboSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { items, ...rest } = parsed.data;

  // Each Menu Item can only appear once per combo (schema.prisma has a
  // @@unique([comboMealId, productId]) on ComboMealItem) — same guard as
  // the create route, checked here before touching the DB.
  if (items) {
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
  }

  try {
    // Replace the whole item list when items are sent — simpler and safer
    // than diffing add/remove/qty-change for a handful of rows.
    const combo = await prisma.$transaction(async (tx) => {
      if (items) {
        await tx.comboMealItem.deleteMany({ where: { comboMealId: Number(id) } });
      }
      return tx.comboMeal.update({
        where: { id: Number(id) },
        data: {
          ...rest,
          ...(items ? { items: { create: items.map((i) => ({ productId: i.productId, qty: i.qty })) } } : {}),
        },
        include: { items: { include: { product: { select: { id: true, name: true } } } } },
      });
    });

    await notify("menu:updated", {});
    return NextResponse.json(combo);
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
    console.error("Failed to update combo:", err);
    return NextResponse.json({ error: "Could not update combo. Please try again." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;
  try {
    await prisma.comboMeal.delete({ where: { id: Number(id) } });
  } catch (err) {
    // A combo that has been sold is referenced by order history and can't be
    // hard-deleted (P2003); it used to surface as a raw 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003") {
        return NextResponse.json(
          { error: "This combo has been ordered before and can't be deleted. Turn it off (inactive) instead." },
          { status: 409 }
        );
      }
      if (err.code === "P2025") return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }
    throw err;
  }
  await notify("menu:updated", {});
  return NextResponse.json({ ok: true });
}
