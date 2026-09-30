import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createStaffSchema } from "@/lib/validations";
import { hashPassword } from "@/lib/passwords";
import { verifyReauth } from "@/lib/reauth";
import { readJson, reauthFailureResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/services/audit";

// GET /api/admin/staff — list every account and its status
export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.staff.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      active: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });
  // isSelf lets the Users screen disable actions that make no sense on your
  // own row without the browser having to know who you are.
  const me = Number(session.user.id);
  return NextResponse.json(rows.map((r) => ({ ...r, isSelf: r.id === me })), {
    headers: { "Cache-Control": "no-store" },
  });
}

// POST /api/admin/staff — create a new Staff/Admin account.
// Needs the acting admin's own password (confirmPassword). The new account is
// flagged mustChangePassword: the password an admin types for someone else is
// only a starting point, and they must replace it before doing anything.
export async function POST(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createStaffSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { name, username, password, role, confirmPassword } = parsed.data;

  const actorId = Number(session.user.id);
  const actorName = session.user.name ?? session.user.username;

  const reauth = await verifyReauth(actorId, actorName, confirmPassword, req.headers);
  if (!reauth.ok) return reauthFailureResponse(reauth);

  const existing = await prisma.staff.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  let staff;
  try {
    staff = await prisma.staff.create({
      data: { name, username, passwordHash, role, mustChangePassword: true },
      select: { id: true, name: true, username: true, role: true, active: true, mustChangePassword: true, createdAt: true },
    });
  } catch (err) {
    // The findUnique above is check-then-create: two admins submitting the
    // same username at once both pass it and the loser hits the unique index.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    throw err;
  }

  await logAudit({
    action: "staff.create",
    entityType: "Staff",
    entityId: staff.id,
    description: `Created ${role.toLowerCase()} account "${username}" (${name})`,
    actorName,
    actorId,
  });

  return NextResponse.json(staff, { status: 201, headers: { "Cache-Control": "no-store" } });
}
