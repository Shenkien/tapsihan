import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveStaff } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validations";
import { passwordPolicyError } from "@/lib/password-policy";
import { hashPassword } from "@/lib/passwords";
import { verifyReauth } from "@/lib/reauth";
import { noStoreJson, readJson, reauthFailureResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/services/audit";

// POST /api/account/change-password — any signed-in account changes ITS OWN
// password. This is the only route (besides sign-in itself) that still works
// while an account is flagged mustChangePassword, which is why it uses
// getLiveStaff() instead of requireRole().
//
// Needs the current password. Wrong attempts share the throttle used for
// admin re-confirmation. On success every session for the account — this one
// included — stops working (sessionVersion changes), so the browser signs
// out and the person logs in again with the new password.
export async function POST(req: NextRequest) {
  const live = await getLiveStaff();
  if (!live) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { staff } = live;

  const parsed = changePasswordSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const policyProblem = passwordPolicyError(newPassword, { username: staff.username });
  if (policyProblem) return NextResponse.json({ error: policyProblem }, { status: 400 });

  const reauth = await verifyReauth(staff.id, staff.name, currentPassword, req.headers);
  if (!reauth.ok) return reauthFailureResponse(reauth);

  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "Pick a password that's different from the current one." }, { status: 400 });
  }

  await prisma.staff.update({
    where: { id: staff.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
  });

  await logAudit({
    action: "account.change_password",
    entityType: "Staff",
    entityId: staff.id,
    description: `"${staff.username}" changed their own password`,
    actorName: staff.name,
    actorId: staff.id,
  });

  return noStoreJson({ ok: true });
}
