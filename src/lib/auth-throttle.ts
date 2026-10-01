import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Failed-attempt throttling, stored in the database (table AuthFailure) so it
// holds across serverless instances and restarts.
//
// A lock is "N or more failures inside the last WINDOW_MS". It lifts on its
// own once enough old failures age out of the window — no unlock step, and
// nothing that stays locked forever.
//
// Login itself is NOT throttled (the shop has only a few staff accounts).
// This throttle now only protects the admin "confirm your password" prompt.

export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const LIMIT_REAUTH = 5;

type Kind = "REAUTH";

/** Milliseconds until this tier unlocks, or 0 if it isn't locked. */
async function tierLockedMs(where: Prisma.AuthFailureWhereInput, limit: number): Promise<number> {
  const since = new Date(Date.now() - THROTTLE_WINDOW_MS);
  const rows = await prisma.authFailure.findMany({
    where: { ...where, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { createdAt: true },
  });
  if (rows.length < limit) return 0;
  // Unlocks when the limit-th most recent failure ages out of the window.
  return Math.max(0, rows[limit - 1].createdAt.getTime() + THROTTLE_WINDOW_MS - Date.now());
}

async function insertFailure(kind: Kind, subject: string, ip: string): Promise<number> {
  const row = await prisma.authFailure.create({ data: { kind, subject, ip }, select: { id: true } });
  // Housekeeping: now and then, drop anything older than a day.
  if (Math.random() < 0.05) {
    await prisma.authFailure
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
      .catch(() => {});
  }
  return row.id;
}

// --------------------------------------------------------------- reauth ----

const reauthSubject = (staffId: number) => `staff:${staffId}`;

export function reauthLockedMs(staffId: number): Promise<number> {
  return tierLockedMs({ kind: "REAUTH", subject: reauthSubject(staffId) }, LIMIT_REAUTH);
}

export async function recordReauthFailure(staffId: number, ip: string) {
  await insertFailure("REAUTH", reauthSubject(staffId), ip);
}

export async function clearReauthFailures(staffId: number) {
  await prisma.authFailure.deleteMany({ where: { kind: "REAUTH", subject: reauthSubject(staffId) } });
}

/**
 * Called when an admin resets or re-activates someone: their failure history
 * shouldn't keep them locked out of the fresh password.
 */
export async function clearAllFailuresFor(staffId: number, username: string) {
  await prisma.authFailure.deleteMany({
    where: {
      OR: [
        { kind: "LOGIN", subject: username.toLowerCase() }, // leftover rows from before
        { kind: "REAUTH", subject: reauthSubject(staffId) },
      ],
    },
  });
}

// ------------------------------------------------------------------- ip ----

/**
 * Best-effort client address. On Vercel the platform sets x-forwarded-for
 * itself, so the first entry can be trusted. Behind your own proxy, make sure
 * it overwrites (not appends to) that header — otherwise a client can spoof it
 * and dodge the per-address tiers (the per-username tiers still apply).
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return (first || headers.get("x-real-ip")?.trim() || "unknown").slice(0, 64);
}