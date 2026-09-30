import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getMockPrintLog } from "@/lib/services/printer";

// GET /api/dev/print-log — inspect what would have been "printed" in mock mode.
//
// The log holds real receipt contents (order numbers, line items, totals).
// In production it is off unless ALLOW_PAYMENT_SIMULATION=true is set on
// purpose, and even then only a signed-in admin can read it. (It used to be
// gated on PAYMENT_MODE === "stub" (that setting no longer exists; it was the permanent production
// setting, so it was open on the live site.)
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    if (process.env.ALLOW_PAYMENT_SIMULATION !== "true") {
      return NextResponse.json({ error: "Not available" }, { status: 404 });
    }
    const session = await requireRole(["ADMIN"]);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(getMockPrintLog());
}
