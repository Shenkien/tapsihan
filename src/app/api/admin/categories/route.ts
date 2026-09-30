import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createCategorySchema } from "@/lib/validations";
import { readJson } from "@/lib/api-helpers";

// GET /api/admin/categories?type=INGREDIENT|PRODUCT — the maintained list
// behind the Category dropdown on the Ingredient and Menu Item forms.
// Omit `type` to get both lists together (used by Category Maintenance).
export async function GET(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type");
  const categories = await prisma.category.findMany({
    where: type ? { type: type as "INGREDIENT" | "PRODUCT" } : undefined,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createCategorySchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { name, type } = parsed.data;

  const existing = await prisma.category.findFirst({
    where: { type, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json({ error: `"${existing.name}" already exists.` }, { status: 409 });
  }

  const category = await prisma.category.create({ data: { name, type } });
  return NextResponse.json(category, { status: 201 });
}
