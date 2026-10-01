import NextAuth, { CredentialsSignin, type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations";
import { verifyPassword } from "@/lib/passwords";
import { clientIp } from "@/lib/auth-throttle";
import { logAudit } from "@/lib/services/audit";
import { ensureBootstrapAdmin } from "@/lib/bootstrap-admin";

export type Role = "STAFF" | "ADMIN";

// Shown to the person by LoginForm via the `code` on the signIn() result.
// "invalid" deliberately covers every way a login can fail (no such user,
// wrong password, deactivated account) so the response never says which.
class InvalidLogin extends CredentialsSignin {
  code = "invalid";
}

// A signed-in admin session lasts one working day, then the person has to log
// in again. (NextAuth's default is 30 days — far too long for a shared
// counter PC.)
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        // credentials is untyped client input. loginSchema caps lengths so an
        // absurdly long string can't be hashed or hit the DB lookup below.
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) throw new InvalidLogin();
        const { username, password } = parsed.data;
        const ip = clientIp(request.headers);

        // If the database has no admin at all (fresh or wiped), create the
        // one described by BOOTSTRAP_ADMIN_* before looking the user up.
        await ensureBootstrapAdmin();

        const staff = await prisma.staff.findUnique({ where: { username } });

        // Always run a bcrypt compare — against a dummy hash when the account
        // doesn't exist — so an unknown username takes as long as a wrong
        // password and timing can't be used to find real usernames.
        const passwordOk = await verifyPassword(password, staff?.passwordHash ?? null);

        if (!staff || !passwordOk || !staff.active) throw new InvalidLogin();

        if (staff.role === "ADMIN") {
          await logAudit({
            action: "auth.login",
            entityType: "Auth",
            entityId: staff.id,
            description: `Admin "${staff.username}" signed in from ${ip}`,
            actorName: staff.name,
            actorId: staff.id,
          });
        }

        return {
          id: String(staff.id),
          name: staff.name,
          username: staff.username,
          role: staff.role,
          mustChangePassword: staff.mustChangePassword,
          sv: staff.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword ?? false;
        token.sv = user.sv;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.role = token.role as Role;
        session.user.mustChangePassword =
          (token.mustChangePassword as boolean | undefined) ?? false;
        session.user.sv = (token.sv as number | undefined) ?? -1;
      }
      return session;
    },
  },
});

export type LiveStaff = {
  id: number;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
};

/**
 * The signed-in account, checked against the database on every call.
 *
 * The JWT is issued at login and never revisited, so on its own it goes
 * stale: a deactivated or demoted account, or one whose password was just
 * changed or reset, would keep working until the token expires. This re-reads
 * the row and returns null unless the account still exists, is active, and
 * the session version hasn't moved since this token was issued (it moves on
 * every password change/reset; tokens from before this check existed carry no
 * `sv` and are rejected too — everyone signs in once more after upgrading).
 *
 * One primary-key lookup per authenticated request.
 */
export async function getLiveStaff(): Promise<{ session: Session; staff: LiveStaff } | null> {
  const session = await auth();
  if (!session?.user) return null;

  const staffId = Number(session.user.id);
  if (!Number.isInteger(staffId)) return null;

  const row = await prisma.staff.findUnique({
    where: { id: staffId },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      active: true,
      mustChangePassword: true,
      sessionVersion: true,
    },
  });
  if (!row || !row.active) return null;
  if (session.user.sv !== row.sessionVersion) return null;

  const { sessionVersion: _ignored, ...staff } = row;
  void _ignored;
  return { session, staff: { ...staff, role: staff.role as Role } };
}

export type RoleCheck =
  | { ok: true; session: Session }
  | { ok: false; reason: "unauthenticated" | "forbidden" | "must_change_password" };

/**
 * Like requireRole, but says WHY it failed so a page can send the person to
 * the right place (login vs. the forced change-password screen).
 */
export async function checkRole(allowedRoles: Role[]): Promise<RoleCheck> {
  const live = await getLiveStaff();
  if (!live) return { ok: false, reason: "unauthenticated" };
  if (!allowedRoles.includes(live.staff.role)) return { ok: false, reason: "forbidden" };
  // An account still on an admin-chosen password can do nothing but change it.
  if (live.staff.mustChangePassword) return { ok: false, reason: "must_change_password" };

  // Hand back the live values rather than the token's copies.
  return {
    ok: true,
    session: {
      ...live.session,
      user: {
        ...live.session.user,
        id: String(live.staff.id),
        name: live.staff.name,
        username: live.staff.username,
        role: live.staff.role,
        mustChangePassword: false,
      },
    },
  };
}

/**
 * Requires a signed-in staff member with one of the allowed roles; null
 * otherwise. Every write-capable API route funnels through here, so a
 * deactivated, demoted, password-changed, or must-change-password account is
 * treated as signed out everywhere at once.
 */
export async function requireRole(allowedRoles: Role[]) {
  const result = await checkRole(allowedRoles);
  return result.ok ? result.session : null;
}