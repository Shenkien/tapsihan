import type { AdminPurchaseOrder } from "@/types/models";

// Shared by the Purchase Orders list and the Suppliers order history so a PO
// looks the same everywhere: same status colours, same "overdue" rule.

// An order still waiting on delivery after this many days is flagged as overdue.
export const OVERDUE_AFTER_DAYS = 7;

export const PO_STATUS_STYLE: Record<AdminPurchaseOrder["status"], string> = {
  ORDERED: "bg-[#fdf1d9] text-[#8a5a00]",
  RECEIVED: "bg-[#e7f0e5] text-[#2b4f3d]",
  CANCELLED: "bg-rice-100 text-charcoal-900/50",
};

type PoDates = Pick<AdminPurchaseOrder, "status" | "createdAt" | "expectedDate">;

// "YYYY-MM-DD" for today in the viewer's own timezone (Philippines for the
// admin), so "today" never flips a day early/late because of UTC.
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Is this PO overdue, and how late? With an expected delivery date: overdue
// once today is PAST that day (delivering on the day itself is on time).
// Without one: falls back to the old rule — waiting OVERDUE_AFTER_DAYS or more
// since it was created.
export function poOverdue(po: PoDates): { overdue: boolean; days: number } {
  if (po.status !== "ORDERED") return { overdue: false, days: 0 };
  if (po.expectedDate) {
    const expected = po.expectedDate.slice(0, 10);
    const today = localToday();
    const days = Math.round((Date.parse(today) - Date.parse(expected)) / 86_400_000);
    return { overdue: days > 0, days: Math.max(days, 0) };
  }
  const days = Math.floor((Date.now() - new Date(po.createdAt).getTime()) / 86_400_000);
  return { overdue: days >= OVERDUE_AFTER_DAYS, days };
}

// Expected date is a plain calendar day stored at UTC midnight, so format it
// in UTC or it can show as the day before.
export function formatExpected(expectedDate: string) {
  return new Date(expectedDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
}
