// Password rules shared by the browser (live hints in the forms) and the
// server (the real check). Pure functions only — no Node APIs — so it is safe
// to import from a "use client" component. The server always re-checks.

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt only looks at the first 72 BYTES of a password and silently ignores
// the rest. Capping at 72 bytes (not characters — "é" or an emoji is more than
// one byte) means every character someone types is really being checked.
export const PASSWORD_MAX_BYTES = 72;

// Passwords that would be guessed in the first few tries, including this
// app's own seeded defaults. Compared case-insensitively.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "12345678", "123456789",
  "1234567890", "qwerty123", "qwertyuiop", "iloveyou", "welcome1", "welcome123",
  "letmein1", "admin123", "admin1234", "administrator", "staff123", "staff1234",
  "tapsihan", "tapsihan1", "tapsihan123", "kuystapsihan", "kuys123", "abc12345",
  "11111111", "00000000", "changeme", "changeme1", "changeme123",
]);

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Returns a human-readable problem with the password, or null if it's fine.
 * `username` (optional) stops a password that just contains the login name.
 */
export function passwordPolicyError(password: string, opts: { username?: string } = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (byteLength(password) > PASSWORD_MAX_BYTES) {
    return `Password is too long (max ${PASSWORD_MAX_BYTES} bytes — about ${PASSWORD_MAX_BYTES} plain characters).`;
  }
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  if (/^(.)\1+$/.test(password)) {
    return "Password can't be one character repeated.";
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too easy to guess. Pick something less common.";
  }
  const u = opts.username?.trim().toLowerCase();
  if (u && u.length >= 3 && password.toLowerCase().includes(u)) {
    return "Password can't contain the username.";
  }
  return null;
}

/** Individual checks, for a live checklist next to the field. */
export function passwordChecklist(password: string, opts: { username?: string } = {}) {
  const u = opts.username?.trim().toLowerCase();
  return [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { label: "A letter and a number", ok: /\p{L}/u.test(password) && /\p{N}/u.test(password) },
    {
      label: "Not a common password or the username",
      ok:
        password.length > 0 &&
        !COMMON_PASSWORDS.has(password.toLowerCase()) &&
        !/^(.)\1+$/.test(password) &&
        !(u && u.length >= 3 && password.toLowerCase().includes(u)),
    },
    { label: `Under ${PASSWORD_MAX_BYTES} bytes`, ok: byteLength(password) <= PASSWORD_MAX_BYTES },
  ];
}
