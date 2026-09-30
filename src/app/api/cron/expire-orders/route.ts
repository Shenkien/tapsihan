import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { expireStaleOrders } from "@/lib/services/orderCancel";

// GET /api/cron/expire-orders — run by Vercel Cron (see vercel.json).
// Cancels unpaid orders older than 30 minutes and returns their stock.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET
// env var is set. Without that variable this route refuses to run at all
// (fail closed), so it can't be triggered by strangers.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const h = (v: string) => crypto.createHash("sha256").update(v).digest();
  if (!secret || !crypto.timingSafeEqual(h(given), h(`Bearer ${secret}`))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cancelled = await expireStaleOrders(200);
  return NextResponse.json({ cancelled });
}
