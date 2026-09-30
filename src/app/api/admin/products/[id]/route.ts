import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { updateProductSchema } from "@/lib/validations";
import { notify } from "@/lib/pusher";
import { logAudit } from "@/lib/services/audit";
import { invalidIdResponse, readJson } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;
  const product = await prisma.product.findUnique({ where: { id: Number(id) } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;
  const parsed = updateProductSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const before = await prisma.product.findUnique({ where: { id: Number(id) } });
  const product = await prisma.product.update({
    where: { id: Number(id) },
    data: parsed.data,
  });
  // Only the price is worth an audit trail here — toggles like Available/
  // Best Seller/New change what the kiosk shows, not what something costs.
  if (before && parsed.data.price !== undefined && parsed.data.price !== before.price) {
    await logAudit({
      action: "product.price_change",
      entityType: "Product",
      entityId: product.id,
      description: `Changed "${product.name}" price from ₱${before.price.toFixed(2)} to ₱${product.price.toFixed(2)}`,
      actorName: session.user.name ?? session.user.username,
      actorId: Number(session.user.id),
    });
  }
  // Covers every edit made from Admin > Menu Items, not just price/category:
  // toggling Available, Best Seller, or New also changes what the kiosk
  // should show, so it's simplest to always notify rather than special-case
  // which fields matter.
  await notify("menu:updated", {});
  return NextResponse.json(product);
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
  // Soft delete: keep historical order data intact
  const product = await prisma.product.update({ where: { id: Number(id) }, data: { active: false } });
  await notify("menu:updated", {});
  return NextResponse.json(product);
}
