import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createPurchaseOrderSchema } from "@/lib/validations";
import { readJson } from "@/lib/api-helpers";
import { mmddPH } from "@/lib/time";
import { fromCentavos, toCentavos } from "@/lib/money";

const includeItems = {
  supplier: { select: { id: true, name: true } },
  items: { include: { ingredient: { select: { id: true, name: true, unit: true } } } },
} as const;

export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pos = await prisma.purchaseOrder.findMany({ orderBy: { createdAt: "desc" }, include: includeItems });
  return NextResponse.json(pos);
}

function generatePoNumber() {
  const stamp = mmddPH();
  // 6-digit suffix (900,000 possibilities) instead of 4 — makes a same-day
  // collision far less likely, but we still retry on P2002 below since
  // "less likely" isn't "impossible" on a busy day.
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `PO-${stamp}-${rand}`;
}

const MAX_PO_NUMBER_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createPurchaseOrderSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { supplierId, items, expectedDate } = parsed.data;
  // Each line rounded to whole centavos, then added and divided once (float sums drift).
  const totalCost = fromCentavos(items.reduce((sum, i) => sum + toCentavos(i.qty * i.unitCost), 0));

  for (let attempt = 1; attempt <= MAX_PO_NUMBER_ATTEMPTS; attempt++) {
    try {
      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber: generatePoNumber(),
          supplierId,
          totalCost,
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          items: { create: items.map((i) => ({ ingredientId: i.ingredientId, qty: i.qty, unitCost: i.unitCost })) },
        },
        include: includeItems,
      });
      return NextResponse.json(po, { status: 201 });
    } catch (err) {
      // poNumber is @unique — a same-day collision on the random suffix hits
      // this. Retry with a freshly generated number a few times before
      // giving up, same as the recipe route's P2002 handling.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        if (attempt < MAX_PO_NUMBER_ATTEMPTS) continue;
        return NextResponse.json(
          { error: "Could not generate a unique PO number. Please try again." },
          { status: 409 }
        );
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        return NextResponse.json(
          { error: "The selected supplier or an ingredient no longer exists. Refresh the page and try again." },
          { status: 400 }
        );
      }
      console.error("Failed to create purchase order:", err);
      return NextResponse.json({ error: "Could not create purchase order. Please try again." }, { status: 500 });
    }
  }

  // Unreachable, but keeps TypeScript happy about all paths returning.
  return NextResponse.json({ error: "Could not create purchase order. Please try again." }, { status: 500 });
}
