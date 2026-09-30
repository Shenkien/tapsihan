import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { updateUnitSchema } from "@/lib/validations";
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
  const parsed = updateUnitSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const existing = await prisma.unitOfMeasure.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

  if (
    parsed.data.abbreviation &&
    parsed.data.abbreviation.trim().toLowerCase() !== existing.abbreviation.toLowerCase()
  ) {
    const clash = await prisma.unitOfMeasure.findFirst({
      where: { abbreviation: { equals: parsed.data.abbreviation, mode: "insensitive" }, id: { not: existing.id } },
    });
    if (clash) {
      return NextResponse.json({ error: `"${clash.abbreviation}" already exists.` }, { status: 409 });
    }
  }
  if (parsed.data.name && parsed.data.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await prisma.unitOfMeasure.findFirst({
      where: { name: { equals: parsed.data.name, mode: "insensitive" }, id: { not: existing.id } },
    });
    if (clash) {
      return NextResponse.json({ error: `"${clash.name}" already exists.` }, { status: 409 });
    }
  }

  let unit;
  try {
    unit = await prisma.unitOfMeasure.update({ where: { id: Number(id) }, data: parsed.data });
  } catch (err) {
    // Same race window as POST: the clash checks above are still
    // TOCTOU-able between two concurrent edits.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That name or abbreviation already exists." }, { status: 409 });
    }
    console.error("Failed to update unit:", err);
    return NextResponse.json({ error: "Could not update unit. Please try again." }, { status: 500 });
  }

  // Ingredient.unit stores the abbreviation as a plain string, not a
  // foreign key — push a renamed abbreviation out to every Ingredient
  // still using the old one so they follow the rename.
  if (parsed.data.abbreviation && parsed.data.abbreviation !== existing.abbreviation) {
    await prisma.ingredient.updateMany({
      where: { unit: existing.abbreviation },
      data: { unit: parsed.data.abbreviation },
    });
  }

  return NextResponse.json(unit);
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
  const existing = await prisma.unitOfMeasure.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

  const inUse = await prisma.ingredient.count({ where: { unit: existing.abbreviation, active: true } });
  if (inUse > 0) {
    return NextResponse.json(
      { error: `${inUse} ingredient(s) still use this unit. Change them first.` },
      { status: 400 }
    );
  }

  await prisma.unitOfMeasure.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
