// Console tool for account recovery — the one place an ADMIN password can be
// reset for someone else. Whoever can run this already has your database
// credentials, so it is deliberately NOT exposed through the website.
//
//   npm run auth -- reset <username>          new temporary password, must change at login
//   npm run auth -- force-change [username]   make one account (or ALL) choose a new password
//   npm run auth -- unlock <username>         clear failed-login lockouts
//
// reset and force-change also sign out every session the account has open.
import "dotenv/config"; // load DATABASE_URL from .env when run through tsx
import { PrismaClient } from "@prisma/client";
import { hashPassword, generateTempPassword } from "../src/lib/passwords";

const prisma = new PrismaClient();

function usage(): never {
  console.log(`Usage:
  npm run auth -- reset <username>
  npm run auth -- force-change [username]   (no username = every account)
  npm run auth -- unlock <username>`);
  return process.exit(1);
}

async function audit(action: string, description: string, entityId?: number) {
  await prisma.auditLog.create({
    data: { action, entityType: "Staff", entityId, description, actorName: "server console" },
  });
}

async function main() {
  const [command, rawUser] = process.argv.slice(2);
  const username = rawUser?.trim().toLowerCase();

  if (command === "reset") {
    if (!username) usage();
    const staff = await prisma.staff.findUnique({ where: { username } });
    if (!staff) throw new Error(`No account with the username "${username}".`);
    const temp = generateTempPassword();
    await prisma.staff.update({
      where: { id: staff.id },
      data: {
        passwordHash: await hashPassword(temp),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
        active: true,
      },
    });
    await prisma.authFailure.deleteMany({
      where: { OR: [{ kind: "LOGIN", subject: username }, { kind: "REAUTH", subject: `staff:${staff.id}` }] },
    });
    await audit("staff.reset_password", `Reset the password for "${staff.username}" from the server console`, staff.id);
    console.log(`\nTemporary password for "${staff.username}" (shown once):\n\n  ${temp}\n`);
    console.log("They'll be asked to choose their own password at next login. The account is active.");
    return;
  }

  if (command === "force-change") {
    const where = username ? { username } : {};
    const result = await prisma.staff.updateMany({
      where,
      data: { mustChangePassword: true, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } },
    });
    if (username && result.count === 0) throw new Error(`No account with the username "${username}".`);
    await audit("staff.force_password_change", `Required a password change for ${username ? `"${username}"` : "all accounts"} from the server console`);
    console.log(`${result.count} account(s) now have to choose a new password at next login, and their open sessions were ended.`);
    return;
  }

  if (command === "unlock") {
    if (!username) usage();
    const staff = await prisma.staff.findUnique({ where: { username } });
    const r = await prisma.authFailure.deleteMany({
      where: {
        OR: [
          { kind: "LOGIN", subject: username },
          ...(staff ? [{ kind: "REAUTH", subject: `staff:${staff.id}` }] : []),
        ],
      },
    });
    console.log(`Cleared ${r.count} failed-attempt record(s) for "${username}".`);
    return;
  }

  usage();
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
