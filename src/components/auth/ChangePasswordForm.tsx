"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { LogoStacked } from "@/components/logo";
import { logoutAndGoTo } from "@/lib/logout";
import { passwordChecklist, passwordPolicyError } from "@/lib/password-policy";

export default function ChangePasswordForm({
  username,
  forced,
  homePath,
  loginPath,
}: {
  username: string;
  /** True when the account MUST change its password before doing anything else. */
  forced: boolean;
  homePath: string;
  loginPath: string;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const checklist = passwordChecklist(next, { username });
  const policyProblem = next ? passwordPolicyError(next, { username }) : null;
  const mismatch = confirm.length > 0 && confirm !== next;
  const sameAsCurrent = next.length > 0 && next === current;
  const canSubmit =
    !submitting && current.length > 0 && next.length > 0 && !policyProblem && confirm === next && !sameAsCurrent;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't change the password. Try again.");
        return;
      }
      // Every session for this account — this one too — stops working the
      // moment the password changes, so sign out cleanly and send the person
      // to log in with the new one.
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      await logoutAndGoTo(`${loginPath}?changed=1`);
    } catch (err) {
      console.error("Change password failed:", err);
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const eye = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      aria-label={show ? "Hide passwords" : "Show passwords"}
      aria-pressed={show}
      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-charcoal-900/50 hover:text-charcoal-900"
    >
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <div className="bg-brand-pattern screen items-center justify-center bg-leaf-900 p-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-border bg-white p-8 shadow-brand"
      >
        <div className="flex justify-center">
          <LogoStacked className="h-20 w-auto" />
        </div>
        <h2 className="text-center text-2xl">Change password</h2>
        {forced ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            An admin set your password, so you need to choose your own before you continue.
          </p>
        ) : (
          <p className="text-center text-sm text-charcoal-900/60">
            Signed in as <span className="font-semibold">{username}</span>
          </p>
        )}

        {/* Lets password managers file the new password against the right login. */}
        <input type="text" name="username" value={username} autoComplete="username" readOnly hidden />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="current-password" required filled={current.length > 0}>
            {forced ? "Temporary password" : "Current password"}
          </Label>
          <div className="relative">
            <Input
              id="current-password"
              type={show ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="pr-10"
              autoFocus
            />
            {eye}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password" required filled={next.length > 0 && !policyProblem && !sameAsCurrent}>
            New password
          </Label>
          <Input
            id="new-password"
            type={show ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            aria-invalid={Boolean(next && (policyProblem || sameAsCurrent))}
          />
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {checklist.map((c) => (
              <li
                key={c.label}
                className={`flex items-center gap-1.5 ${
                  next.length === 0 ? "text-charcoal-900/50" : c.ok ? "text-emerald-700" : "text-danger"
                }`}
              >
                {next.length > 0 && c.ok ? <Check size={12} /> : next.length > 0 ? <X size={12} /> : <span className="w-3 text-center">·</span>}
                {c.label}
              </li>
            ))}
          </ul>
          <FieldError message={sameAsCurrent ? "Pick a password that's different from the current one." : null} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-password" required filled={confirm.length > 0 && !mismatch}>
            Confirm new password
          </Label>
          <Input
            id="confirm-password"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch}
          />
          <FieldError message={mismatch ? "The two passwords don't match." : null} />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {done && <p className="text-sm text-emerald-700">Password changed. Signing you out…</p>}

        <Button type="submit" disabled={!canSubmit || done}>
          {submitting ? "Saving…" : "Change password"}
        </Button>

        {forced ? (
          <button
            type="button"
            onClick={() => logoutAndGoTo(loginPath)}
            className="text-center text-sm text-charcoal-900/60 underline-offset-2 hover:text-achuete-600 hover:underline"
          >
            Log out instead
          </button>
        ) : (
          <Link
            href={homePath}
            className="text-center text-sm text-charcoal-900/60 underline-offset-2 hover:text-achuete-600 hover:underline"
          >
            Cancel
          </Link>
        )}
      </form>
    </div>
  );
}
