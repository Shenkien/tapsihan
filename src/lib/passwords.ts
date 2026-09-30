// Server-only password helpers (uses Node's crypto). Keep this file free of
// "@/..." imports so the maintenance script in prisma/ can import it directly.
import { compare, hash, hashSync } from "bcryptjs";
import { randomBytes, randomInt } from "crypto";
import { passwordPolicyError } from "./password-policy";

// bcrypt work factor. 12 is a sensible 2026 default for a login that happens a
// few times a day; existing hashes made at 10 keep verifying — only new
// hashes use this.
export const BCRYPT_COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_COST);
}

// A real bcrypt hash of a random string nobody knows. When a login names a
// username that doesn't exist, we still run a bcrypt compare against this, so
// "no such user" takes as long as "wrong password" and response time can't be
// used to discover which usernames exist. Built once, lazily.
let dummyHash: string | null = null;
function getDummyHash(): string {
  const h = dummyHash ?? hashSync(randomBytes(24).toString("hex"), BCRYPT_COST);
  dummyHash = h;
  return h;
}

/**
 * Compares `plain` to `storedHash`. Pass null for an account that doesn't
 * exist — a compare is still performed (against a throwaway hash) and the
 * result is always false, so both paths cost the same.
 */
export async function verifyPassword(plain: string, storedHash: string | null): Promise<boolean> {
  const ok = await compare(plain, storedHash ?? getDummyHash());
  return storedHash !== null && ok;
}

// No 0/O, 1/l/I — this gets read aloud or copied by hand.
const TEMP_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * A random temporary password: 12 characters from a 54-symbol alphabet
 * (~69 bits), from crypto.randomInt (a CSPRNG, unlike Math.random()).
 * Retries until it satisfies the same password policy users are held to
 * (so it always has a letter and a digit).
 */
export function generateTempPassword(): string {
  for (;;) {
    let out = "";
    for (let i = 0; i < 12; i++) out += TEMP_CHARS[randomInt(TEMP_CHARS.length)];
    if (passwordPolicyError(out) === null) return out;
  }
}
