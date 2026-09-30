"use client";

export type GcashAccountInfo = { accountName: string | null; accountNumber: string | null };

/**
 * Fetches the store's GCash account name/number (Admin > Maintenance >
 * GCash Payment) so a "gcash-pending" receipt can be printed with enough
 * detail for the customer to actually send payment from — the kiosk QR
 * itself is only on screen for the ~15s before auto-reset, so the printed
 * paper can't rely on the customer having scanned it in time. Once the
 * kiosk resets, this account name/number is the only surviving copy of how
 * to pay.
 *
 * Best-effort: any failure returns nulls instead of throwing, so a flaky
 * settings fetch never blocks the receipt from printing — the receipt
 * layout already falls back to "scan the kiosk's GCash QR" wording when
 * both fields come back empty.
 */
export async function fetchGcashAccountInfo(): Promise<GcashAccountInfo> {
  try {
    const res = await fetch("/api/payments/gcash-qr");
    if (!res.ok) return { accountName: null, accountNumber: null };
    const data = await res.json();
    return {
      accountName: typeof data?.accountName === "string" ? data.accountName : null,
      accountNumber: typeof data?.accountNumber === "string" ? data.accountNumber : null,
    };
  } catch {
    return { accountName: null, accountNumber: null };
  }
}

export type GcashConfig =
  | { status: "ok"; configured: boolean; imagePath: string | null; accountName: string | null; accountNumber: string | null }
  | { status: "error" };

/**
 * Loads the GCash checkout settings and tells "not set up" (configured: false)
 * apart from "couldn't load" (status: "error") — the two need different
 * messages and only the first should hide GCash.
 */
export async function fetchGcashConfig(): Promise<GcashConfig> {
  try {
    const res = await fetch("/api/payments/gcash-qr", { cache: "no-store" });
    if (!res.ok) return { status: "error" };
    const d = await res.json();
    if (typeof d?.configured !== "boolean") return { status: "error" };
    return {
      status: "ok",
      configured: d.configured,
      imagePath: typeof d.imagePath === "string" && d.imagePath ? d.imagePath : null,
      accountName: typeof d.accountName === "string" && d.accountName ? d.accountName : null,
      accountNumber: typeof d.accountNumber === "string" && d.accountNumber ? d.accountNumber : null,
    };
  } catch {
    return { status: "error" };
  }
}
