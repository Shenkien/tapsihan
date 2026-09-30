import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { updateRecipeSchema } from "@/lib/validations";
import { invalidIdResponse, readJson } from "@/lib/api-helpers";

// GET /api/admin/products/[id]/recipe — this Menu Item's Bill of Materials.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;
  const items = await prisma.recipeItem.findMany({
    where: { productId: Number(id) },
    include: { ingredient: { select: { id: true, name: true, unit: true, stock: true } } },
    orderBy: { id: "asc" },
  });
  return NextResponse.json(items);
}

// PUT /api/admin/products/[id]/recipe  { items: [{ ingredientId, qty }] }
// Replaces the whole recipe in one go. Passing an empty items array clears
// the recipe entirely, which sends this Menu Item back to its legacy
// `stock` field until a new recipe is built.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;
  const productId = Number(id);
  const parsed = updateRecipeSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Menu item not found" }, { status: 404 });

  // Each ingredient can only appear once per recipe (schema.prisma has a
  // @@unique([productId, ingredientId]) on RecipeItem) — checked explicitly
  // here with a clear message instead of letting createMany hit that
  // constraint and throw a raw P2002 the caller has to decode.
  const seenIngredientIds = new Set<number>();
  const duplicateIngredientIds = new Set<number>();
  for (const item of parsed.data.items) {
    if (seenIngredientIds.has(item.ingredientId)) duplicateIngredientIds.add(item.ingredientId);
    seenIngredientIds.add(item.ingredientId);
  }
  if (duplicateIngredientIds.size > 0) {
    return NextResponse.json(
      { error: "This recipe lists the same inventory item more than once. Each item can only appear once per recipe." },
      { status: 400 }
    );
  }

  try {
    const items = await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { productId } });
      if (parsed.data.items.length > 0) {
        await tx.recipeItem.createMany({
          data: parsed.data.items.map((i) => ({ productId, ingredientId: i.ingredientId, qty: i.qty })),
        });
      }
      return tx.recipeItem.findMany({
        where: { productId },
        include: { ingredient: { select: { id: true, name: true, unit: true, stock: true } } },
        orderBy: { id: "asc" },
      });
    });

    return NextResponse.json(items);
  } catch (err) {
    // Duplicate-ingredient rows are already caught above, but this is a
    // fallback — a bad ingredientId (deleted between page-load and save)
    // hits the ingredient foreign key (P2003) the same way, and this way
    // the caller always gets a real JSON error body instead of an
    // unhandled 500 with an empty one (which crashed the tab outright —
    // res.json() throws "Unexpected end of JSON input" on an empty body).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "This recipe lists the same inventory item more than once. Each item can only appear once per recipe." },
        { status: 400 }
      );
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: "One of these inventory items no longer exists. Refresh the page and try again." },
        { status: 400 }
      );
    }
    console.error("Failed to save recipe:", err);
    return NextResponse.json({ error: "Could not save recipe. Please try again." }, { status: 500 });
  }
}
