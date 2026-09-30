import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/passwords";
import {
  clearReauthFailures,
  clientIp,
  reauthLockedMs,
  recordReauthFailure,
} from "@/lib/auth-throttle";
import { logAudit } from "@/lib/services/audit";

export type ReauthResult =
  | { ok: true }
  | { ok: false; status: 401 | 429; error: string; retryAfterSec?: number };

function minutes(ms: number) {
  return Math.max(1, Math.ceil(ms / 60000));
}

/**
 * Proves the person at the keyboard is really the signed-in admin, by
 * checking the password they just typed against that account's stored hash.
 *
 * Being logged in isn't enough for sensitive actions (create/reset/deactivate
 * an account): an admin who walks away from an unlocked counter PC would
 * otherwise let anyone reset any account, including the other admin's, and
 * sign in as them. Wrong attempts are throttled and logged.
 */
export async function verifyReauth(
  staffId: number,
  actorName: string,
  password: string,
  headers: Headers
): Promise<ReauthResult> {
  const lockedMs = await reauthLockedMs(staffId);
  if (lockedMs > 0) {
    return {
      ok: false,
      status: 429,
      error: `Too many wrong passwords. Try again in about ${minutes(lockedMs)} minute(s).`,
      retryAfterSec: Math.ceil(lockedMs / 1000),
    };
  }

  const row = await prisma.staff.findUnique({ where: { id: staffId }, select: { passwordHash: true } });
  const ok = await verifyPassword(password, row?.passwordHash ?? null);

  if (!ok) {
    await recordReauthFailure(staffId, clientIp(headers));
    await logAudit({
      action: "auth.reauth_failed",
      entityType: "Auth",
      entityId: staffId,
      description: "Wrong password entered while confirming a sensitive action",
      actorName,
      actorId: staffId,
    });
    return { ok: false, status: 401, error: "That password is incorrect." };
  }

  await clearReauthFailures(staffId);
  return { ok: true };
}
