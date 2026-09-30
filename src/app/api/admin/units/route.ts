import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createUnitSchema } from "@/lib/validations";
import { readJson } from "@/lib/api-helpers";

// GET /api/admin/units — the maintained list behind the Unit dropdown on
// the Ingredient form (Admin > Inventory > Add Item).
export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const units = await prisma.unitOfMeasure.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(units);
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createUnitSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { name, abbreviation } = parsed.data;

  // `name` and `abbreviation` are both @unique on UnitOfMeasure, so either
  // one colliding needs its own friendly check before it hits the DB.
  const existingAbbreviation = await prisma.unitOfMeasure.findFirst({
    where: { abbreviation: { equals: abbreviation, mode: "insensitive" } },
  });
  if (existingAbbreviation) {
    return NextResponse.json(
      { error: `"${existingAbbreviation.abbreviation}" already exists.` },
      { status: 409 }
    );
  }
  const existingName = await prisma.unitOfMeasure.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existingName) {
    return NextResponse.json({ error: `"${existingName.name}" already exists.` }, { status: 409 });
  }

  try {
    const unit = await prisma.unitOfMeasure.create({ data: { name, abbreviation } });
    return NextResponse.json(unit, { status: 201 });
  } catch (err) {
    // Both fields are @unique — the findFirst checks above still leave a
    // window between two concurrent submissions, so catch the resulting
    // P2002 instead of letting it fall through as a bare 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That name or abbreviation already exists." }, { status: 409 });
    }
    console.error("Failed to create unit:", err);
    return NextResponse.json({ error: "Could not create unit. Please try again." }, { status: 500 });
  }
}
