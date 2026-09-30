// Client-side versions of the rules in lib/validations.ts, so a form can show
// the problem under the exact field instead of only a toast after a failed
// save. The server still re-checks everything — these only mirror it.

const NAME_CHARS = /^[\p{L}\p{N} .,()/&'-]+$/u;

export function nameError(value: string, label: string, max = 120): string | null {
  const v = value.trim();
  if (!v) return `${label} is required`;
  if (v.length > max) return `${label} is too long (max ${max} characters)`;
  if (!NAME_CHARS.test(v)) return `${label} can only contain letters, numbers, spaces, and . , ( ) / & ' -`;
  if (!/\p{L}/u.test(v)) return `${label} must contain at least one letter`;
  return null;
}

export function optionalNameError(value: string, label: string, max = 120): string | null {
  return value.trim() ? nameError(value, label, max) : null;
}

export function moneyError(
  value: string | number,
  label: string,
  opts: { required?: boolean; max?: number } = {}
): string | null {
  const raw = String(value).trim();
  if (!raw) return opts.required ? `${label} is required` : null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${label} must be a number`;
  if (n < 0) return `${label} can't be negative`;
  if (opts.max !== undefined && n > opts.max) return `${label} looks too high`;
  return null;
}

export function phoneError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^[0-9]{7,11}$/.test(v) ? null : "Phone must be 7–11 digits, numbers only";
}

export function emailError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Enter a valid email address";
}

export function usernameError(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return "Username is required";
  if (v.length < 3) return "Username must be at least 3 characters";
  if (!/^[a-z0-9._-]+$/.test(v)) return "Username can only contain letters, numbers, dots, - and _";
  return null;
}
