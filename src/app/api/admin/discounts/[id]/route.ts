import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { updateDiscountSchema } from "@/lib/validations";
import { invalidIdResponse, readJson } from "@/lib/api-helpers";
import { logAudit } from "@/lib/services/audit";

// PUT /api/admin/discounts/[id]  { name?, percent?, active? }
// Changing the percentage only affects orders discounted from now on — every
// order keeps the name and percent it was discounted with.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;

  const parsed = updateDiscountSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const existing = await prisma.discount.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Discount not found" }, { status: 404 });

  if (parsed.data.name && parsed.data.name.toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await prisma.discount.findFirst({
      where: { name: { equals: parsed.data.name, mode: "insensitive" }, id: { not: existing.id } },
    });
    if (clash) return NextResponse.json({ error: `"${clash.name}" already exists.` }, { status: 409 });
  }

  try {
    const discount = await prisma.discount.update({ where: { id: existing.id }, data: parsed.data });

    const changes: string[] = [];
    if (parsed.data.percent !== undefined && parsed.data.percent !== existing.percent) {
      changes.push(`rate ${existing.percent}% → ${parsed.data.percent}%`);
    }
    if (parsed.data.name && parsed.data.name !== existing.name) changes.push(`renamed from "${existing.name}"`);
    if (parsed.data.active !== undefined && parsed.data.active !== existing.active) {
      changes.push(parsed.data.active ? "turned on" : "turned off");
    }
    if (changes.length > 0) {
      await logAudit({
        action: "discount.update",
        entityType: "Discount",
        entityId: discount.id,
        description: `Discount "${discount.name}": ${changes.join(", ")}`,
        actorName: session.user.name ?? session.user.username ?? "Unknown",
        actorId: Number(session.user.id),
      });
    }
    return NextResponse.json(discount);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That name already exists." }, { status: 409 });
    }
    console.error("Failed to update discount:", err);
    return NextResponse.json({ error: "Could not update discount. Please try again." }, { status: 500 });
  }
}

// DELETE /api/admin/discounts/[id] — orders keep their own copy of the
// discount, so removing one never changes past receipts.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;

  const existing = await prisma.discount.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Discount not found" }, { status: 404 });

  await prisma.discount.delete({ where: { id: existing.id } });
  await logAudit({
    action: "discount.delete",
    entityType: "Discount",
    entityId: existing.id,
    description: `Removed discount "${existing.name}" (${existing.percent}%)`,
    actorName: session.user.name ?? session.user.username ?? "Unknown",
    actorId: Number(session.user.id),
  });
  return NextResponse.json({ ok: true });
}
