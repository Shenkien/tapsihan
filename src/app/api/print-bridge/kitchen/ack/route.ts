import { NextRequest, NextResponse } from "next/server";
import { notify } from "@/lib/pusher";
import { isBridgeAuthorized } from "@/lib/bridge-auth";
import { readJson } from "@/lib/api-helpers";

// POST /api/print-bridge/kitchen/ack
// body: { orderNo, status: "printed" | "failed", error?: string }
//
// The kitchen bridge device (src/app/print-bridge/kitchen/page.tsx) calls
// this after it actually attempts a print that was requested via
// /api/print-bridge/kitchen/request, so anything waiting on the result
// (right now: a toast on the Staff screen after a manual "Reprint Kitchen
// Ticket" tap) finds out what happened instead of assuming success the
// moment the request was sent. Same pattern as /api/print-bridge/ack for
// the customer receipt. Broadcasts "kitchen-ticket:print-result" on the
// same "orders" Pusher channel everything else here already uses.
export async function POST(req: NextRequest) {
  // Only the bridge devices, which hold PRINT_BRIDGE_KEY, may report a print
  // result — otherwise anyone could broadcast a fake "printed".
  if (!isBridgeAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const b = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const orderNo = typeof b.orderNo === "string" ? b.orderNo : null;
  const status = b.status === "printed" || b.status === "failed" ? b.status : null;
  // Truncated — this only ever needs to be enough for a toast/log, and it's
  // coming from a device we don't otherwise validate input length from.
  const error = typeof b.error === "string" ? b.error.slice(0, 300) : undefined;

  if (!orderNo || !status) {
    return NextResponse.json(
      { error: 'orderNo and status ("printed" | "failed") are required' },
      { status: 400 }
    );
  }

  await notify("kitchen-ticket:print-result", { orderNo, status, error });
  return NextResponse.json({ ok: true });
}
