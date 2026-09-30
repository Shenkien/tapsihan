import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { csvField } from "@/lib/csv";

// GET /api/admin/export/menu.csv
export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const products = await prisma.product.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });

  const rows = ["name,category,price,active"];
  for (const p of products) {
    rows.push([csvField(p.name), csvField(p.category), p.price, p.active].join(","));
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=menu-items.csv",
    },
  });
}
