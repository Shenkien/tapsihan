import crypto from "crypto";

// A customer who placed an order gets a random secret when it is created.
// Only its SHA-256 hash is stored, so a database leak can't be used to cancel
// orders, and the secret is never sent again (it lives in the customer's
// screen memory only). It lets the person who placed an UNPAID order cancel
// that one order, and nothing else.

/** New random secret (shown to the customer once) and the hash to store. */
export function newCancelToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(24).toString("base64url");
  return { token, hash: hashCancelToken(token) };
}

export function hashCancelToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Constant-time check of a presented secret against the stored hash. */
export function cancelTokenMatches(token: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashCancelToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
