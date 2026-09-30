import { rateLimited } from "@/lib/rate-limit";

const WINDOW_MS = 10 * 60 * 1000;

/** Returns true if this print request is over the limit (and should get a 429). */
export function printRateLimited(opts: { orderNo: string; ip: string; perOrder: number; perIp?: number }) {
  return rateLimited({
    kind: "PRINT",
    subject: opts.orderNo,
    ip: opts.ip,
    windowMs: WINDOW_MS,
    perSubject: opts.perOrder,
    perIp: opts.perIp,
  });
}
