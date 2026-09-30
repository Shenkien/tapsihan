import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductAvailable } from "@/lib/services/availability";
import { fromCentavos, lineCentavos, roundPeso } from "@/lib/money";
import type { MenuCombo } from "@/types/models";

// GET /api/combos — active Combo Meals, for the kiosk/QR flow. Mirrors
// /api/products: still returns out-of-stock combos (grayed out in the UI)
// rather than dropping them, so a combo missing a recipe on one of its
// items doesn't just silently vanish with no explanation.
export async function GET() {
  try {
    const combos = await prisma.comboMeal.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: { product: { include: { recipeItems: { include: { ingredient: true } } } } },
        },
      },
    });

    const withAvailability: MenuCombo[] = combos.map((c) => {
      // `every` on an empty array is true, so a Combo Meal with no items
      // configured yet would report itself in stock and be sellable for its
      // full price while containing nothing. /api/products guards the same
      // way with `recipeItems.length > 0`.
      const inStock = c.items.length > 0 && c.items.every((ci) => isProductAvailable(ci.product, ci.qty));
      const regularPrice =
        fromCentavos(c.items.reduce((sum, ci) => sum + lineCentavos(ci.product.price, ci.qty), 0));
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        imageUrl: c.imageUrl,
        price: c.price,
        items: c.items.map((ci) => ({ productId: ci.productId, name: ci.product.name, qty: ci.qty })),
        regularPrice,
        savings: Math.max(0, roundPeso(regularPrice - c.price)),
        inStock,
      };
    });

    return NextResponse.json(withAvailability);
  } catch (err) {
    console.error("GET /api/combos failed:", err);
    return NextResponse.json({ error: "Failed to load combos" }, { status: 500 });
  }
}
