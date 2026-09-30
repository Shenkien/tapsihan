import { prisma } from "@/lib/prisma";

// Small per-address / per-key request limiter, stored in the existing
// AuthFailure table (a row per request, told apart by `kind`) so it holds
// across serverless instances and needs no new table or service.
//
// The hit is recorded FIRST and then counted, so a burst of parallel requests
// can't all slip under the limit (check-then-act would let them).
//
// Kinds in use: "LOGIN" / "REAUTH" (auth-throttle.ts), "PRINT" (print-throttle.ts),
// "ORDER" (POST /api/orders), "CANCEL" (customer self-cancel).

/** Returns true if this request is over a limit and should get a 429. */
export async function rateLimited(opts: {
  kind: string;
  /** What is being limited per key (an order number, or a fixed label). */
  subject: string;
  ip: string;
  windowMs: number;
  perSubject?: number;
  perIp?: number;
}): Promise<boolean> {
  const since = new Date(Date.now() - opts.windowMs);
  await prisma.authFailure.create({ data: { kind: opts.kind, subject: opts.subject, ip: opts.ip } });
  if (Math.random() < 0.05) {
    await prisma.authFailure
      .deleteMany({ where: { kind: opts.kind, createdAt: { lt: since } } })
      .catch(() => {});
  }
  if (opts.perSubject) {
    const n = await prisma.authFailure.count({
      where: { kind: opts.kind, subject: opts.subject, createdAt: { gte: since } },
    });
    if (n > opts.perSubject) return true;
  }
  if (opts.perIp) {
    const n = await prisma.authFailure.count({
      where: { kind: opts.kind, ip: opts.ip, createdAt: { gte: since } },
    });
    if (n > opts.perIp) return true;
  }
  return false;
}
