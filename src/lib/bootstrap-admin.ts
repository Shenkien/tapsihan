import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwords";
import { passwordPolicyError } from "@/lib/password-policy";
import { logAudit } from "@/lib/services/audit";

/**
 * Self-healing first admin. If the Staff table has no ADMIN account, create
 * one from BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD (set in Vercel,
 * redeploy after changing). Does nothing if either is missing or an admin
 * already exists. The account must change its password at first login.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || !password) return;

  try {
    const admins = await prisma.staff.count({ where: { role: "ADMIN" } });
    if (admins > 0) return;

    const problem = passwordPolicyError(password, { username });
    if (problem) {
      console.error(`BOOTSTRAP_ADMIN_PASSWORD was not used to create the admin: ${problem}`);
      return;
    }

    const created = await prisma.staff.create({
      data: {
        name: "Administrator",
        username,
        passwordHash: await hashPassword(password),
        role: "ADMIN",
        active: true,
        mustChangePassword: true,
      },
      select: { id: true },
    });

    await logAudit({
      action: "auth.bootstrap",
      entityType: "Auth",
      entityId: created.id,
      description: `No admin account existed, so "${username}" was created from the server settings`,
      actorName: "system",
    });
  } catch (err) {
    // P2002 = another request already created it. Never break login.
    const code = (err as { code?: string } | null)?.code;
    if (code !== "P2002") console.error("Bootstrap admin check failed:", err);
  }
}