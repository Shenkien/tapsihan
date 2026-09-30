import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { updateIngredientSchema } from "@/lib/validations";
import { notify } from "@/lib/pusher";
import { invalidIdResponse, readJson } from "@/lib/api-helpers";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;
  const parsed = updateIngredientSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const existing = await prisma.ingredient.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
  if (parsed.data.supplierId && !(await prisma.supplier.findUnique({ where: { id: parsed.data.supplierId } }))) {
    return NextResponse.json({ error: "That supplier no longer exists." }, { status: 400 });
  }

  // Same duplicate check POST does — name+category is only unique among
  // active ingredients, and either field can be edited here, so a rename
  // (or a re-category) can walk straight into an existing active item just
  // as easily as creating a new one can.
  const nextName = parsed.data.name ?? existing.name;
  const nextCategory = parsed.data.category ?? existing.category;
  const willBeActive = parsed.data.active ?? existing.active;
  if (
    willBeActive &&
    (parsed.data.name !== undefined || parsed.data.category !== undefined)
  ) {
    const clash = await prisma.ingredient.findFirst({
      where: {
        active: true,
        id: { not: existing.id },
        name: { equals: nextName, mode: "insensitive" },
        category: { equals: nextCategory, mode: "insensitive" },
      },
    });
    if (clash) {
      return NextResponse.json({ error: `"${clash.name}" already exists.` }, { status: 409 });
    }
  }

  const ingredient = await prisma.ingredient.update({ where: { id: Number(id) }, data: parsed.data });
  // Editing an ingredient directly (stock, trackByPiece, active, etc. —
  // not just the dedicated adjust/PO-receive endpoints) can also change a
  // Recipe-linked Menu Item's kiosk availability.
  await notify("menu:updated", {});
  return NextResponse.json(ingredient);
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
  // Soft delete: keeps historical PO/recipe/order data intact.
  const ingredient = await prisma.ingredient.update({ where: { id: Number(id) }, data: { active: false } });
  await notify("menu:updated", {});
  return NextResponse.json(ingredient);
}
