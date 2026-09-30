import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createIngredientSchema } from "@/lib/validations";
import { readJson } from "@/lib/api-helpers";

// GET /api/admin/ingredients — raw materials bought from Suppliers, kept
// separate from Product (Menu Items). Used by Inventory, Recipes, and the
// New Purchase Order picker.
export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [ingredients, received] = await Promise.all([
    prisma.ingredient.findMany({
      orderBy: { name: "asc" },
      include: { supplier: { select: { id: true, name: true } } },
    }),
    // Most recent RECEIVED purchase of each ingredient (distinct keeps the
    // first row per ingredient, i.e. the newest) — derived, nothing stored.
    prisma.purchaseOrderItem.findMany({
      where: { purchaseOrder: { status: "RECEIVED" } },
      orderBy: { purchaseOrder: { receivedAt: "desc" } },
      distinct: ["ingredientId"],
      select: {
        ingredientId: true,
        unitCost: true,
        purchaseOrder: { select: { receivedAt: true, createdAt: true, supplier: { select: { name: true } } } },
      },
    }),
  ]);
  const lastPurchase = new Map(
    received.map((r) => [
      r.ingredientId,
      {
        date: (r.purchaseOrder.receivedAt ?? r.purchaseOrder.createdAt).toISOString(),
        unitCost: r.unitCost,
        supplierName: r.purchaseOrder.supplier.name,
      },
    ])
  );
  return NextResponse.json(ingredients.map((i) => ({ ...i, lastPurchase: lastPurchase.get(i.id) ?? null })));
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createIngredientSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { name, category, unit, stock, cost, lowStockThreshold, trackByPiece, pieceStock, piecesPerUnit, pieceUnitLabel, supplierId } =
    parsed.data;
  if (supplierId && !(await prisma.supplier.findUnique({ where: { id: supplierId } }))) {
    return NextResponse.json({ error: "That supplier no longer exists." }, { status: 400 });
  }
  const resolvedCategory = category?.trim() || "Uncategorized";

  const existing = await prisma.ingredient.findFirst({
    where: {
      active: true,
      name: { equals: name, mode: "insensitive" },
      category: { equals: resolvedCategory, mode: "insensitive" },
    },
  });
  if (existing) {
    return NextResponse.json({ error: `"${existing.name}" already exists.` }, { status: 409 });
  }

  const ingredient = await prisma.ingredient.create({
    data: {
      name,
      category: resolvedCategory,
      unit,
      stock: stock ?? 0,
      cost: cost ?? 0,
      lowStockThreshold: lowStockThreshold ?? 5,
      trackByPiece: trackByPiece ?? false,
      pieceStock: pieceStock ?? 0,
      piecesPerUnit: piecesPerUnit ?? 1,
      pieceUnitLabel: pieceUnitLabel?.trim() || "pcs",
      supplierId: supplierId ?? null,
    },
  });
  return NextResponse.json(ingredient, { status: 201 });
}
