// Philippine time helpers. The Philippines has no daylight saving, so a fixed
// UTC+8 offset is exact. Vercel servers run in UTC, so `setHours(0,0,0,0)`
// makes "today" roll over at 08:00 in Manila; use these instead.

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 00:00 Philippine time of the day containing `now`, as a real instant. */
export function startOfTodayPH(now: Date = new Date()): Date {
  const ph = new Date(now.getTime() + PH_OFFSET_MS);
  ph.setUTCHours(0, 0, 0, 0);
  return new Date(ph.getTime() - PH_OFFSET_MS);
}

/** 00:00 Philippine time, `days` calendar days before today (0 = today). */
export function startOfDayPH(daysAgo: number, now: Date = new Date()): Date {
  return new Date(startOfTodayPH(now).getTime() - daysAgo * DAY_MS);
}

/** Hour of day (0-23) in Philippine time. */
export function hourPH(d: Date): number {
  return new Date(d.getTime() + PH_OFFSET_MS).getUTCHours();
}

/** "MMDD" in Philippine time (used in PO numbers). */
export function mmddPH(now: Date = new Date()): string {
  const ph = new Date(now.getTime() + PH_OFFSET_MS);
  return `${String(ph.getUTCMonth() + 1).padStart(2, "0")}${String(ph.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Prisma `where` for "sold in this window", booked by payment time. Orders
 * saved before Order.paidAt was recorded have it null, so they fall back to
 * their creation time instead of vanishing from reports.
 */
export function soldBetween(gte: Date, lte?: Date) {
  const range = lte ? { gte, lte } : { gte };
  return { OR: [{ paidAt: range }, { paidAt: null, createdAt: range }] };
}
