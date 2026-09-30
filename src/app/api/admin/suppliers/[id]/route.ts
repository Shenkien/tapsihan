import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { updateSupplierSchema } from "@/lib/validations";
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
  const parsed = updateSupplierSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  if (parsed.data.name) {
    const clash = await prisma.supplier.findFirst({
      where: { name: { equals: parsed.data.name, mode: "insensitive" }, id: { not: Number(id) } },
    });
    if (clash) {
      return NextResponse.json(
        { error: `A supplier named "${clash.name}" already exists.` },
        { status: 409 }
      );
    }
  }

  const supplier = await prisma.supplier.update({ where: { id: Number(id) }, data: parsed.data });
  return NextResponse.json(supplier);
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
  const poCount = await prisma.purchaseOrder.count({ where: { supplierId: Number(id) } });
  if (poCount > 0) {
    return NextResponse.json(
      { error: "This supplier has purchase orders on file and can't be deleted." },
      { status: 400 }
    );
  }
  await prisma.supplier.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
