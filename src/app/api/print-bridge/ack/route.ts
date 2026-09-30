import { NextRequest, NextResponse } from "next/server";
import { notify } from "@/lib/pusher";
import { isBridgeAuthorized } from "@/lib/bridge-auth";
import { readJson } from "@/lib/api-helpers";

// POST /api/print-bridge/ack
// body: { orderNo, variant, status: "printed" | "failed", error?: string }
//
// The bridge phone (src/app/print-bridge/page.tsx) calls this after it
// actually attempts a print that was requested via
// /api/print-bridge/request, so the device that asked for the print (the
// iPad kiosk, via OrderFlow.tsx) can find out what happened instead of
// assuming success the moment the request was sent. Broadcasts
// "receipt:print-result" on the same "orders" Pusher channel everything
// else here already uses.
export async function POST(req: NextRequest) {
  // Only the bridge devices, which hold PRINT_BRIDGE_KEY, may report a print
  // result — otherwise anyone could broadcast a fake "printed".
  if (!isBridgeAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const b = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const orderNo = typeof b.orderNo === "string" ? b.orderNo : null;
  const variant =
    b.variant === "cash-pending" || b.variant === "gcash-pending" || b.variant === "paid"
      ? b.variant
      : null;
  const status = b.status === "printed" || b.status === "failed" ? b.status : null;
  // Truncated — this only ever needs to be enough for a toast/log, and it's
  // coming from a device we don't otherwise validate input length from.
  const error = typeof b.error === "string" ? b.error.slice(0, 300) : undefined;

  if (!orderNo || !variant || !status) {
    return NextResponse.json(
      {
        error:
          'orderNo, variant ("cash-pending" | "gcash-pending" | "paid"), and status ("printed" | "failed") are required',
      },
      { status: 400 }
    );
  }

  await notify("receipt:print-result", { orderNo, variant, status, error });
  return NextResponse.json({ ok: true });
}
