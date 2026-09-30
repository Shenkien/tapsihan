import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { updateCategorySchema } from "@/lib/validations";
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
  const parsed = updateCategorySchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const existing = await prisma.category.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  // Same case-insensitive duplicate check as POST — renaming into a name
  // that's already used (by another row) for this type would otherwise
  // hit the @@unique([name, type]) constraint as a raw 500.
  if (parsed.data.name && parsed.data.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await prisma.category.findFirst({
      where: {
        type: existing.type,
        name: { equals: parsed.data.name, mode: "insensitive" },
        id: { not: existing.id },
      },
    });
    if (clash) {
      return NextResponse.json({ error: `"${clash.name}" already exists.` }, { status: 409 });
    }
  }

  const category = await prisma.category.update({ where: { id: Number(id) }, data: parsed.data });

  // Category.name is matched by name, not a hard foreign key, so renaming
  // it here has to be pushed out to every Ingredient/Product row that was
  // using the old name — otherwise they'd silently fall back to "old name,
  // no longer a real category" instead of following the rename.
  if (parsed.data.name && parsed.data.name !== existing.name) {
    if (existing.type === "INGREDIENT") {
      await prisma.ingredient.updateMany({
        where: { category: existing.name },
        data: { category: parsed.data.name },
      });
    } else {
      await prisma.product.updateMany({
        where: { category: existing.name },
        data: { category: parsed.data.name },
      });
      // Only a PRODUCT category rename touches what the kiosk shows —
      // Ingredient categories never reach the customer-facing menu.
      await notify("menu:updated", {});
    }
  }

  return NextResponse.json(category);
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
  const existing = await prisma.category.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const inUse =
    existing.type === "INGREDIENT"
      ? await prisma.ingredient.count({ where: { category: existing.name, active: true } })
      : await prisma.product.count({ where: { category: existing.name, active: true } });
  if (inUse > 0) {
    return NextResponse.json(
      { error: `${inUse} item(s) still use this category. Move or rename them first.` },
      { status: 400 }
    );
  }

  await prisma.category.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
