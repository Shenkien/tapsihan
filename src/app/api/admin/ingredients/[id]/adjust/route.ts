import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { ingredientAdjustSchema } from "@/lib/validations";
import { notify } from "@/lib/pusher";
import { HttpError, invalidIdResponse, readJson, toErrorResponse } from "@/lib/api-helpers";

// POST /api/admin/ingredients/[id]/adjust  { change, reason }
// Manual restock/waste/adjustment of an Ingredient, outside a PO.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;
  const parsed = ingredientAdjustSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { change, reason, target, note } = parsed.data;
  const ingredientId = Number(id);
  const pool = target ?? "stock";

  const exists = await prisma.ingredient.findUnique({ where: { id: ingredientId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

  // Let the database do the arithmetic. The old code read the stock, added
  // `change` in JS and wrote back the absolute number, so a kiosk sale that
  // landed between the read and the write was silently undone (stock jumped
  // back up). Here the increment happens inside Postgres, and a removal is
  // guarded by `gte` so the stock can never go negative, even under
  // concurrent sales.
  const guard =
    change < 0
      ? pool === "pieceStock"
        ? { pieceStock: { gte: -change } }
        : { stock: { gte: -change } }
      : {};
  const data =
    pool === "pieceStock" ? { pieceStock: { increment: change } } : { stock: { increment: change } };

  let updated;
  let log;
  try {
    [updated, log] = await prisma.$transaction(async (tx) => {
      const res = await tx.ingredient.updateMany({ where: { id: ingredientId, ...guard }, data });
      if (res.count === 0) throw new HttpError(400, "Resulting stock cannot be negative");
      return Promise.all([
        tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }),
        tx.ingredientLog.create({ data: { ingredientId, change, reason, target: pool, note: note || null } }),
      ]);
    });
  } catch (err) {
    return toErrorResponse(err);
  }

  // A Recipe-linked Menu Item's kiosk availability is computed live from
  // this ingredient's stock/pieceStock — a manual adjustment (restock,
  // waste, correction) can flip an item in or out of stock, so the kiosk
  // needs to refetch just like it does for a direct Menu Item edit.
  await notify("menu:updated", {});

  return NextResponse.json({ ingredient: updated, log });
}
