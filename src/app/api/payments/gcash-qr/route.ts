import { NextResponse } from "next/server";
import { getGcashSettings } from "@/lib/services/settings";

// GET /api/payments/gcash-qr — the store's static merchant QR shown at
// checkout. Maintained from Admin > Maintenance > GCash Payment. An old
// GCASH_MERCHANT_QR_PATH env var is still honoured if someone set it on
// purpose, but there is no phantom default file any more: with nothing saved,
// `configured` is false and `imagePath` is null, so the kiosk can hide GCash
// instead of showing a broken image.
export async function GET() {
  try {
    const settings = await getGcashSettings();
    const imagePath = settings.qrImageUrl || process.env.GCASH_MERCHANT_QR_PATH || null;
    return NextResponse.json(
      {
        configured: Boolean(imagePath),
        imagePath,
        accountName: settings.accountName,
        accountNumber: settings.accountNumber,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    // Distinguishable from "not configured": the client shows "couldn't
    // load, tap to retry" for this instead of "QR not set up".
    console.error("GET /api/payments/gcash-qr failed:", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
