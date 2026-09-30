import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductAvailable } from "@/lib/services/availability";

// GET /api/products — active menu items with stock > 0, for the kiosk/QR flow.
// Every Menu Item is recipe-driven now, including sold-as-is items like
// canned drinks or bottled water (each gets its own Inventory Item and a
// 1-line Recipe). A Menu Item is "in stock" only if every one of its
// Ingredients has enough on hand for at least one more order. A Menu Item
// that doesn't have a Recipe set up yet is treated as unavailable — it
// shouldn't be sellable off an old, unmanaged stock number nobody is
// tracking.
export async function GET() {
  // Without this try/catch, a DB error (bad/missing DATABASE_URL, Neon
  // connection drop, etc.) throws inside the handler and Next.js can end up
  // sending a response with no body at all — the client's `res.json()` then
  // fails with "Unexpected end of JSON input" instead of a useful error, and
  // the kiosk is left showing an empty menu with no indication why.
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { recipeItems: { include: { ingredient: true } } },
    });

    const withAvailability = products.map((p) => {
      const inStock = isProductAvailable(p);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        imageUrl: p.imageUrl,
        inStock,
        bestSeller: p.bestSeller,
        isNew: p.isNew,
      };
    });

    // Still send out-of-stock items — the kiosk/QR menu already knows how to
    // show them grayed out with an "Out of stock" badge. Dropping them here
    // instead made a newly added item (still at its default stock of 0, with
    // no Recipe yet) disappear from the menu entirely with no indication why.
    return NextResponse.json(withAvailability);
  } catch (err) {
    console.error("GET /api/products failed:", err);
    return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  }
}
