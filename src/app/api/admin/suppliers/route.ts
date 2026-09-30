import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createSupplierSchema } from "@/lib/validations";
import { readJson } from "@/lib/api-helpers";

export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { purchaseOrders: true } },
      // Last 5 orders so the Suppliers page can show recent order history.
      purchaseOrders: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { items: { include: { ingredient: { select: { id: true, name: true, unit: true } } } } },
      },
    },
  });
  return NextResponse.json(suppliers);
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSupplierSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  // Supplier.name has no @unique in the schema (a real-world business could
  // legitimately have two branches with the same name), so this is an
  // app-level warning rather than a hard DB constraint — same friendly
  // 409 shape as Categories/Units either way.
  const existing = await prisma.supplier.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A supplier named "${existing.name}" already exists.` },
      { status: 409 }
    );
  }

  const supplier = await prisma.supplier.create({ data: parsed.data });
  return NextResponse.json(supplier, { status: 201 });
}
