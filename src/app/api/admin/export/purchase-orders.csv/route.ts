import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { csvField } from "@/lib/csv";

// GET /api/admin/export/purchase-orders.csv
export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pos = await prisma.purchaseOrder.findMany({
    include: { supplier: true },
    orderBy: { createdAt: "desc" },
  });

  const rows = ["poNumber,supplier,status,totalCost,createdAt,expectedDate,receivedAt"];
  for (const po of pos) {
    rows.push(
      [
        po.poNumber,
        csvField(po.supplier.name),
        po.status,
        po.totalCost.toFixed(2),
        po.createdAt.toISOString(),
        po.expectedDate ? po.expectedDate.toISOString().slice(0, 10) : "",
        po.receivedAt ? po.receivedAt.toISOString() : "",
      ].join(",")
    );
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=purchase-orders.csv",
    },
  });
}
