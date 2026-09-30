import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { csvField } from "@/lib/csv";

// GET /api/admin/export/suppliers.csv
export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });

  const rows = ["name,contactPerson,phone,email,createdAt"];
  for (const s of suppliers) {
    rows.push(
      [
        csvField(s.name),
        s.contactPerson ? csvField(s.contactPerson) : "",
        s.phone ?? "",
        s.email ?? "",
        s.createdAt.toISOString(),
      ].join(",")
    );
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=suppliers.csv",
    },
  });
}
