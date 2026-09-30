import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { csvField } from "@/lib/csv";
import { ingredientUnitCost } from "@/lib/utils";

// GET /api/admin/export/inventory.csv
export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ingredients = await prisma.ingredient.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  const rows = ["section,name,category/unit,onHand,unitCost,totalValue"];
  for (const i of ingredients) {
    // stock is a running "total ever received" counter for a trackByPiece
    // item — it never goes down as pieces are sold, and its cost is priced
    // per pack, not per piece. Using it directly here (like every other
    // ingredient) overstated both on-hand qty and value, and the value never
    // dropped as stock was sold. Use pieceStock + the per-piece cost instead,
    // same as the Inventory Items page and Recipes tab already do.
    const onHand = i.trackByPiece ? i.pieceStock : i.stock;
    const unit = i.trackByPiece ? i.pieceUnitLabel : i.unit;
    const unitCost = ingredientUnitCost(i);
    rows.push(
      ["Inventory Item", csvField(i.name), unit, onHand, unitCost, (onHand * unitCost).toFixed(2)].join(",")
    );
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=inventory-valuation.csv",
    },
  });
}
