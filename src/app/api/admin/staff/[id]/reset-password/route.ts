import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/services/audit";
import { invalidIdResponse, noStoreJson, readJson, reauthFailureResponse } from "@/lib/api-helpers";
import { generateTempPassword, hashPassword } from "@/lib/passwords";
import { verifyReauth } from "@/lib/reauth";
import { clearAllFailuresFor } from "@/lib/auth-throttle";
import { reauthSchema } from "@/lib/validations";

// POST /api/admin/staff/[id]/reset-password
//
// There's no email service, so instead of sending a reset link this mints a
// random temporary password, saves its hash, and returns the plaintext ONCE
// for the admin to hand over in person. Then:
//   - the account is flagged mustChangePassword, so the temporary password
//     only works long enough to pick a real one;
//   - sessionVersion is incremented, which makes every session that account
//     already had open stop working (see getLiveStaff in lib/auth.ts);
//   - any lockout from failed logins is cleared so the new password works.
//
// Rules:
//   - Needs the acting admin's own password (confirmPassword).
//   - Can't be used on yourself (use Change password, which asks for your
//     current one) or on another ADMIN. Admin-on-admin reset was a way for
//     one compromised admin session to take over the other admin's account;
//     a forgotten admin password is recovered from the server console with
//     `npm run auth -- reset <username>` instead. See README.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const idError = invalidIdResponse(id);
  if (idError) return idError;

  const body = reauthSchema.safeParse(await readJson(req));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const actorId = Number(session.user.id);
  const actorName = session.user.name ?? session.user.username;

  const reauth = await verifyReauth(actorId, actorName, body.data.confirmPassword, req.headers);
  if (!reauth.ok) return reauthFailureResponse(reauth);

  const staff = await prisma.staff.findUnique({ where: { id: Number(id) } });
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (staff.id === actorId) {
    return NextResponse.json(
      { error: "Use Change password (top right) to change your own password." },
      { status: 400 }
    );
  }
  if (staff.role === "ADMIN") {
    return NextResponse.json(
      {
        error:
          "Admin passwords can't be reset from here. The admin can change their own from Change password, or reset it from the server console (see README).",
      },
      { status: 403 }
    );
  }
  if (!staff.active) {
    return NextResponse.json({ error: "That account is deactivated. Reactivate it first." }, { status: 400 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await prisma.staff.update({
    where: { id: staff.id },
    data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } },
  });
  await clearAllFailuresFor(staff.id, staff.username);

  // The password itself is never logged.
  await logAudit({
    action: "staff.reset_password",
    entityType: "Staff",
    entityId: staff.id,
    description: `Reset the password for "${staff.username}" (${staff.name})`,
    actorName,
    actorId,
  });

  return noStoreJson({ tempPassword });
}
