import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Failed-attempt throttling, stored in the database (table AuthFailure) so it
// holds across serverless instances and restarts.
//
// A lock is "N or more failures inside the last WINDOW_MS". It lifts on its
// own once enough old failures age out of the window — no unlock step, and
// nothing that stays locked forever.
//
// Login uses three tiers, because each one alone has a hole:
//   userIp — this username from this address. Stops guessing at one account
//            from one place, without letting a stranger lock the real owner
//            out from everywhere.
//   ip     — any username from this address. Stops one address spraying
//            guesses across many accounts.
//   user   — this username from anywhere. Stops a slow attack spread over
//            many addresses; set higher so it isn't easy to use as a
//            "lock the admin out" trick.
// The username tiers key on whatever was typed, whether or not the account
// exists, so a lockout can't reveal which usernames are real.

export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const LIMIT_USER_IP = 5;
const LIMIT_IP = 30;
const LIMIT_USER = 20;
const LIMIT_REAUTH = 5;

type Kind = "LOGIN" | "REAUTH";

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

// ---------------------------------------------------------------- login ----

/**
 * `extra` raises every limit by that many. beginLoginAttempt() records the
 * attempt BEFORE the password is checked, so that attempt is already in the
 * table when the lock is evaluated and has to be allowed for.
 */
export async function loginLockedMs(username: string, ip: string, extra = 0): Promise<number> {
  const [a, b, c] = await Promise.all([
    tierLockedMs({ kind: "LOGIN", subject: username, ip }, LIMIT_USER_IP + extra),
    tierLockedMs({ kind: "LOGIN", ip }, LIMIT_IP + extra),
    tierLockedMs({ kind: "LOGIN", subject: username }, LIMIT_USER + extra),
  ]);
  return Math.max(a, b, c);
}

/**
 * Step 1 of a login. The attempt is written first and the lock checked after,
 * so parallel guesses can't all slip past a check that runs before any of
 * them has been recorded (bcrypt takes ~250 ms, a wide window). If the
 * account/address is locked the row is removed again, so refused attempts
 * don't push the unlock time further out.
 *
 * Returns the attempt id (pass it to failLogin/passLogin) or null when locked.
 */
export async function beginLoginAttempt(username: string, ip: string): Promise<number | null> {
  const id = await insertFailure("LOGIN", username, ip);
  if ((await loginLockedMs(username, ip, 1)) > 0) {
    await prisma.authFailure.delete({ where: { id } }).catch(() => {});
    return null;
  }
  return id;
}

/**
 * The attempt was wrong: it stays recorded as a failure. Returns true if this
 * failure is the one that tripped a lock.
 */
export async function failLoginAttempt(username: string, ip: string): Promise<boolean> {
  return (await loginLockedMs(username, ip)) > 0;
}

/** A successful login wipes that account's failure history. */
export async function clearLoginFailures(username: string) {
  await prisma.authFailure.deleteMany({ where: { kind: "LOGIN", subject: username } });
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
        { kind: "LOGIN", subject: username.toLowerCase() },
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
