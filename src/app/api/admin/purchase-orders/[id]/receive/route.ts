import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { notify } from "@/lib/pusher";
import { logAudit } from "@/lib/services/audit";
import { HttpError, invalidIdResponse, toErrorResponse } from "@/lib/api-helpers";

// POST /api/admin/purchase-orders/[id]/receive
// Marks the PO received, restocks every line item, and writes one
// IngredientLog entry per item so it shows up in the same trail as manual
// restocks — this is the "delivered -> stock goes up" step.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: Number(id) },
    include: { items: { include: { ingredient: true } } },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (po.status !== "ORDERED") {
    return NextResponse.json({ error: `This PO is already ${po.status.toLowerCase()}.` }, { status: 400 });
  }

  let updated;
  try {
    updated = await prisma.$transaction(
      async (tx) => {
        // Claim the PO first, atomically: only one of two near-simultaneous
        // requests (double-click, retry on a slow response) can flip ORDERED ->
        // RECEIVED. The loser gets count 0 and stops BEFORE touching stock, so
        // stock can no longer be received twice. (The plain status check above
        // is only there for a friendlier early answer; it is not the guard.)
        const claim = await tx.purchaseOrder.updateMany({
          where: { id: po.id, status: "ORDERED" },
          data: { status: "RECEIVED", receivedAt: new Date() },
        });
        if (claim.count === 0) throw new HttpError(409, "This PO was already received.");

        for (const item of po.items) {
          // Piece-tracked ingredients (bought by weight, used by the piece —
          // Bangus, Rice, etc.) get their usable count auto-derived from the
          // yield ratio, instead of requiring a manual recount after delivery.
          const piecesGained = item.ingredient.trackByPiece
            ? item.qty * item.ingredient.piecesPerUnit
            : 0;
          await tx.ingredient.update({
            where: { id: item.ingredientId },
            data: {
              stock: { increment: item.qty },
              cost: item.unitCost,
              ...(item.ingredient.trackByPiece ? { pieceStock: { increment: piecesGained } } : {}),
            },
          });
          await tx.ingredientLog.create({
            data: { ingredientId: item.ingredientId, change: item.qty, reason: "RESTOCK", note: `Received ${po.poNumber}` },
          });
          if (item.ingredient.trackByPiece) {
            await tx.ingredientLog.create({
              data: {
                ingredientId: item.ingredientId,
                change: piecesGained,
                reason: "RESTOCK",
                target: "pieceStock",
                note: `Received ${po.poNumber}`,
              },
            });
          }
        }
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id: po.id },
          include: {
            supplier: { select: { id: true, name: true } },
            items: { include: { ingredient: { select: { id: true, name: true, unit: true } } } },
          },
        });
      },
      // Up to 200 lines x 2-3 sequential queries on a pooled Postgres can
      // blow past Prisma's 5 s default.
      { maxWait: 10000, timeout: 30000 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }

  // Restocking can bring a Recipe-linked Menu Item back in stock on the
  // kiosk — same reasoning as the manual adjust endpoint.
  await notify("menu:updated", {});

  await logAudit({
    action: "purchase_order.receive",
    entityType: "PurchaseOrder",
    entityId: updated.id,
    description: `Received ${updated.poNumber} from ${updated.supplier.name} — ₱${updated.totalCost.toFixed(2)}, ${updated.items.length} line item(s)`,
    actorName: session.user.name ?? session.user.username,
    actorId: Number(session.user.id),
  });

  return NextResponse.json(updated);
}
