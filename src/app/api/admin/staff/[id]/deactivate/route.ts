import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/services/audit";
import { invalidIdResponse, readJson, reauthFailureResponse } from "@/lib/api-helpers";
import { verifyReauth } from "@/lib/reauth";
import { clearAllFailuresFor } from "@/lib/auth-throttle";
import { setStaffActiveSchema } from "@/lib/validations";

// POST /api/admin/staff/[id]/deactivate — sets active/inactive ({ active: boolean };
// without it, toggles, for old clients).
// Needs the acting admin's own password (confirmPassword). A deactivated
// account is blocked at login and, because every request re-reads the
// account (see getLiveStaff in src/lib/auth.ts), any session it already had
// open stops working immediately. Its row and history are kept, not deleted.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;
  const staffId = Number(id);

  const body = setStaffActiveSchema.safeParse(await readJson(req));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const actorId = Number(session.user.id);
  const actorName = session.user.name ?? session.user.username;

  if (actorId === staffId) {
    return NextResponse.json({ error: "You can't deactivate your own account." }, { status: 400 });
  }

  const reauth = await verifyReauth(actorId, actorName, body.data.confirmPassword, req.headers);
  if (!reauth.ok) return reauthFailureResponse(reauth);

  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.staff.update({
    where: { id: staffId },
    data: { active: body.data.active ?? !staff.active },
    select: { id: true, name: true, username: true, role: true, active: true, mustChangePassword: true, createdAt: true },
  });
  if (updated.active) await clearAllFailuresFor(staff.id, staff.username);

  await logAudit({
    action: updated.active ? "staff.reactivate" : "staff.deactivate",
    entityType: "Staff",
    entityId: staff.id,
    description: `${updated.active ? "Reactivated" : "Deactivated"} "${staff.username}" (${staff.name})`,
    actorName,
    actorId,
  });

  return NextResponse.json(updated, { headers: { "Cache-Control": "no-store" } });
}
