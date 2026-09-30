// Numeric env vars parsed once, safely: a typo like LOW_STOCK_THRESHOLD=five
// used to become NaN and make Prisma reject the whole dashboard query.
export function numberEnv(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    console.warn(`${name}="${raw}" is not a valid number (>= ${min}); using ${fallback}.`);
    return fallback;
  }
  return n;
}
