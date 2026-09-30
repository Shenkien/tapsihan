import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { updateGcashSettingsSchema } from "@/lib/validations";
import { getGcashSettings, setGcashSettings } from "@/lib/services/settings";
import { readJson } from "@/lib/api-helpers";

// GET /api/admin/settings/gcash
export async function GET() {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getGcashSettings();
  return NextResponse.json(settings);
}

// PUT /api/admin/settings/gcash  { qrImageUrl, accountName?, accountNumber? }
// qrImageUrl comes from POST /api/upload (Vercel Blob) — the admin form
// uploads the image first, then saves the returned URL here.
export async function PUT(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateGcashSettingsSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const settings = await setGcashSettings(parsed.data);

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "GcashSettings",
      description: "Updated the GCash QR code / account details shown at checkout",
      actorName: session.user.name ?? session.user.username ?? "Unknown",
    },
  });

  return NextResponse.json(settings);
}
