"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Copy, Eye, EyeOff, KeyRound, Power, ShieldAlert, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { nameError, usernameError } from "@/lib/formRules";
import { passwordChecklist, passwordPolicyError } from "@/lib/password-policy";
import { useRowFlash } from "@/hooks/useRowFlash";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { actionBtn } from "@/components/admin/actionStyles";

// Role uses a plain native <select> below (like Category/Unit dropdowns
// elsewhere in this app), not the Radix-based Select component — Radix's
// Dialog and Select both manage document.body's pointer-events/scroll-lock,
// and nesting a Select inside a Dialog can leave that cleanup racing when
// the dialog closes right after: the dialog's own content stays
// interactive, but the underlying page gets stuck with pointer-events
// disabled on <body>, so every click behind the (now-closed) dialog stops
// registering until a full reload. Filter dropdowns elsewhere (Orders,
// Audit Log) use the Radix Select safely — they're never nested inside a
// Dialog, so they don't hit this.

type StaffRow = {
  id: number;
  name: string;
  username: string;
  role: "STAFF" | "ADMIN";
  active: boolean;
  mustChangePassword: boolean;
  /** True for the signed-in admin's own row (set by the server). */
  isSelf: boolean;
  createdAt: string;
};

type PendingAction = { kind: "reset" | "toggle"; target: StaffRow };

// Browser-side random password for the "Generate" button on Create Account.
// crypto.getRandomValues is a CSPRNG (unlike Math.random). No 0/O/1/l/I.
const GEN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword(): string {
  for (;;) {
    const bytes = new Uint32Array(12);
    crypto.getRandomValues(bytes);
    const out = Array.from(bytes, (b) => GEN_CHARS[b % GEN_CHARS.length]).join("");
    if (passwordPolicyError(out) === null) return out;
  }
}

export default function UsersTab() {
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "STAFF" as "STAFF" | "ADMIN" });
  // The acting admin's OWN password, required to create an account.
  const [createConfirm, setCreateConfirm] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [touched, setTouched] = useState<{ name: boolean; username: boolean }>({ name: false, username: false });

  // Reset password / Deactivate share one dialog. It asks for the admin's own
  // password first; for a reset it then switches to showing the temporary
  // password. One dialog (not two) so it never closes one Radix dialog and
  // opens another in the same tick.
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionPassword, setActionPassword] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [tempResult, setTempResult] = useState<{ username: string; name: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { flash, flashClass } = useRowFlash();
  const { toast } = useToast();

  // Shown under a field only after the person has typed in it (or tried to save).
  const nameProblem = touched.name ? nameError(form.name, "Full name") : null;
  const usernameProblem = touched.username ? usernameError(form.username) : null;
  const newPasswordProblem = passwordPolicyError(form.password, { username: form.username });
  const passwordProblem = passwordTouched ? newPasswordProblem : null;
  const createBlocker = !form.name.trim()
    ? "Enter the full name"
    : usernameError(form.username)
      ? "Enter a valid username"
      : newPasswordProblem
        ? "Choose a stronger password"
        : nameError(form.name, "Full name")
          ? "Fix the full name"
          : !createConfirm
            ? "Enter your own password to confirm"
            : null;

  async function load() {
    const res = await fetch("/api/admin/staff");
    if (res.ok) setStaff(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  function resetCreateForm() {
    setForm({ name: "", username: "", password: "", role: "STAFF" });
    setCreateConfirm("");
    setShowNewPassword(false);
    setPasswordTouched(false);
    setTouched({ name: false, username: false });
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, confirmPassword: createConfirm }),
      });
      const data = await res.json().catch(() => ({}));
      // Whatever happened, the confirmation password isn't kept around.
      setCreateConfirm("");
      if (!res.ok) {
        toast({ title: "Could not create account", description: data.error, variant: "destructive" });
        return;
      }
      toast({
        description: `Account "${form.username}" created. They'll be asked to choose their own password when they first log in.`,
      });
      setCreateOpen(false);
      resetCreateForm();
      await load();
      if (data?.id) flash(data.id);
    } catch (err) {
      console.error("Create account failed:", err);
      toast({ title: "Could not create account", description: "Couldn't reach the server.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function openAction(kind: PendingAction["kind"], target: StaffRow) {
    setActionPassword("");
    setActionError(null);
    setTempResult(null);
    setCopied(false);
    setPending({ kind, target });
  }

  // Also wipes the typed password and any temporary password from state, so
  // neither lingers after the dialog is gone.
  function closeAction() {
    setPending(null);
    setActionPassword("");
    setActionError(null);
    setTempResult(null);
    setCopied(false);
  }

  async function submitAction(e: React.FormEvent) {
    e.preventDefault();
    if (!pending || !actionPassword || actionBusy) return;
    const { kind, target } = pending;
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/admin/staff/${target.id}/${kind === "reset" ? "reset-password" : "deactivate"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "reset"
              ? { confirmPassword: actionPassword }
              : { confirmPassword: actionPassword, active: !target.active }
          ),
        }
      );
      const data = await res.json().catch(() => ({}));
      setActionPassword("");
      if (!res.ok) {
        setActionError(
          data.error === "Unauthorized"
            ? "Your session has expired or your access changed. Reload the page and log in again."
            : (data.error ?? "Something went wrong. Try again.")
        );
        return;
      }
      if (kind === "reset") {
        // Shown once — there's no email step in this project, so this is the
        // only place the plaintext temporary password is ever visible.
        setTempResult({ username: target.username, name: target.name, tempPassword: data.tempPassword });
      } else {
        toast({ description: `${target.name} is now ${data.active ? "active" : "deactivated"}.` });
        closeAction();
      }
      await load();
      flash(target.id);
    } catch (err) {
      console.error("Account action failed:", err);
      setActionError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setActionBusy(false);
    }
  }

  async function copyTempPassword() {
    if (!tempResult) return;
    try {
      await navigator.clipboard.writeText(tempResult.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        description: "Couldn't copy automatically. Click the password to select it, then copy it by hand.",
        variant: "destructive",
      });
    }
  }

  if (!staff) return <p className="opacity-60">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            // Closing the form drops the typed password and confirmation too.
            if (!open) resetCreateForm();
          }}
        >
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" /> Create Account
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Account</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="staff-name" required filled={!nameProblem && form.name.trim().length > 0}>
                  Full name
                </Label>
                <Input
                  id="staff-name"
                  value={form.name}
                  onChange={(e) => {
                    setForm({ ...form, name: e.target.value });
                    setTouched((t) => ({ ...t, name: true }));
                  }}
                  aria-invalid={Boolean(nameProblem)}
                />
                <FieldError message={nameProblem} />
              </div>
              <div>
                <Label htmlFor="staff-username" required filled={!usernameError(form.username)}>
                  Username
                </Label>
                <Input
                  id="staff-username"
                  value={form.username}
                  onChange={(e) => {
                    setForm({ ...form, username: e.target.value });
                    setTouched((t) => ({ ...t, username: true }));
                  }}
                  autoCapitalize="off"
                  placeholder="letters, numbers, . _ -"
                  aria-invalid={Boolean(usernameProblem)}
                />
                <FieldError message={usernameProblem} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="staff-password" required filled={!newPasswordProblem}>
                    Starting password
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, password: generatePassword() }));
                      setShowNewPassword(true);
                      setPasswordTouched(true);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-achuete-600 hover:underline"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Generate
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <Input
                    id="staff-password"
                    type={showNewPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => {
                      setForm({ ...form, password: e.target.value });
                      setPasswordTouched(true);
                    }}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    className="pr-10"
                    aria-invalid={Boolean(passwordProblem)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-charcoal-900/50 hover:text-charcoal-900"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <FieldError message={passwordProblem} />
                {passwordTouched && form.password && (
                  <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                    {passwordChecklist(form.password, { username: form.username }).map((c) => (
                      <li key={c.label} className={c.ok ? "text-emerald-700" : "text-danger"}>
                        {c.ok ? "✓" : "✗"} {c.label}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[11px] text-charcoal-900/50">
                  They&apos;ll be required to replace this with their own password the first time they log in.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staff-role" required filled>
                  Role
                </Label>
                <select
                  id="staff-role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as "STAFF" | "ADMIN" })}
                  className="h-11 rounded-xl border border-border bg-white px-3 text-base"
                >
                  <option value="STAFF">Staff (kitchen/counter)</option>
                  <option value="ADMIN">Admin (full dashboard access)</option>
                </select>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Label htmlFor="staff-confirm" required filled={createConfirm.length > 0}>
                  Your password
                </Label>
                <Input
                  id="staff-confirm"
                  type="password"
                  value={createConfirm}
                  onChange={(e) => setCreateConfirm(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Confirm it's you"
                  className="mt-1.5"
                />
                <p className="mt-1 text-[11px] text-amber-900/80">
                  Creating an account needs your own admin password.
                </p>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                {createBlocker && <span className="mr-auto text-xs font-semibold text-charcoal-900/50">{createBlocker}</span>}
                <DialogClose asChild>
                  <Button size="sm" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  size="sm"
                  disabled={saving || Boolean(createBlocker)}
                  onClick={handleCreate}
                >
                  {saving ? "Creating…" : "Create Account"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-extrabold uppercase tracking-wide text-charcoal-900/40">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr
                key={s.id}
                className={`border-b border-border transition-colors last:border-b-0 ${
                  s.active ? "hover:bg-rice-50" : "bg-charcoal-900/5 text-charcoal-900/50"
                } ${flashClass(s.id)}`}
              >
                <td className="px-4 py-3 font-semibold">{s.name}</td>
                <td className="px-4 py-3 text-charcoal-900/60">{s.username}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      s.role === "ADMIN"
                        ? "rounded-full bg-[#fbe4e1] px-3 py-1 text-xs font-bold text-danger"
                        : "rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800"
                    }
                  >
                    {s.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      s.active
                        ? "rounded-full bg-[#e7f0e5] px-3 py-1 text-xs font-bold text-[#2b4f3d]"
                        : "rounded-full bg-charcoal-900/15 px-3 py-1 text-xs font-bold text-charcoal-900/60"
                    }
                  >
                    {s.active ? "Active" : "Deactivated"}
                  </span>
                  {s.active && s.mustChangePassword && (
                    <span
                      title="Hasn't chosen their own password yet"
                      className="ml-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800"
                    >
                      Must change password
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-charcoal-900/60">{format(new Date(s.createdAt), "MMM d, yyyy")}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      title={
                        s.isSelf
                          ? "Use Change password (top right) for your own account"
                          : s.role === "ADMIN"
                            ? "Admin passwords can't be reset from here"
                            : !s.active
                              ? "Reactivate the account first"
                              : "Reset password"
                      }
                      disabled={s.isSelf || s.role === "ADMIN" || !s.active}
                      onClick={() => openAction("reset", s)}
                      className={actionBtn("key")}
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button
                      title={s.isSelf ? "You can't deactivate your own account" : s.active ? "Deactivate" : "Reactivate"}
                      disabled={s.isSelf}
                      onClick={() => openAction("toggle", s)}
                      className={actionBtn(s.active ? "deactivate" : "activate")}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          // Don't let a stray click drop the dialog while a request is running.
          if (!open && !actionBusy) closeAction();
        }}
      >
        <DialogContent
          // While the temporary password is on screen it can't be lost to a
          // stray click outside or the Esc key — it's shown only once. The
          // Done button (or the X) closes it on purpose.
          onInteractOutside={(e) => {
            if (tempResult) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (tempResult) e.preventDefault();
          }}
        >
          {pending && tempResult ? (
            <TempPasswordView result={tempResult} copied={copied} onCopy={copyTempPassword} onDone={closeAction} />
          ) : pending ? (
            <ReauthView
              pending={pending}
              password={actionPassword}
              onPasswordChange={setActionPassword}
              error={actionError}
              busy={actionBusy}
              onSubmit={submitAction}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Step 1: "type your own password" — shown for both Reset password and Deactivate/Reactivate. */
function ReauthView({
  pending,
  password,
  onPasswordChange,
  error,
  busy,
  onSubmit,
}: {
  pending: PendingAction;
  password: string;
  onPasswordChange: (v: string) => void;
  error: string | null;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const { kind, target } = pending;
  const deactivating = kind === "toggle" && target.active;
  const title =
    kind === "reset" ? `Reset password for ${target.name}?` : `${target.active ? "Deactivate" : "Reactivate"} ${target.name}?`;
  const body =
    kind === "reset"
      ? "This gives them a new temporary password. Their current password stops working right away, anyone signed in as them is signed out, and they'll have to choose their own password at next login."
      : target.active
        ? "They won't be able to log in, and anyone signed in as them is signed out right away. Their history is kept."
        : "They'll be able to log in again with their existing password.";
  const cta = kind === "reset" ? "Reset password" : target.active ? "Deactivate" : "Reactivate";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-charcoal-900/80">{body}</p>
      <div>
        <Label htmlFor="reauth-password" required filled={password.length > 0}>
          Your password
        </Label>
        <Input
          id="reauth-password"
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="current-password"
          placeholder="Confirm it's you"
          className="mt-1.5"
          aria-invalid={Boolean(error)}
          autoFocus
        />
        <FieldError message={error} />
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" size="sm" variant="ghost" disabled={busy}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" size="sm" variant={deactivating || kind === "reset" ? "destructive" : "primary"} disabled={busy || !password}>
          {busy ? "Working…" : cta}
        </Button>
      </div>
    </form>
  );
}

/** Step 2 of a reset: the temporary password, shown once, with a Copy button. */
function TempPasswordView({
  result,
  copied,
  onCopy,
  onDone,
}: {
  result: { username: string; name: string; tempPassword: string };
  copied: boolean;
  onCopy: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle>Temporary password for {result.name}</DialogTitle>
      </DialogHeader>
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          This is shown <strong>only once</strong>. Give it to {result.name} in person — they&apos;ll be asked to choose
          their own password as soon as they log in with it.
        </span>
      </div>
      <div>
        <div className="text-xs font-semibold text-charcoal-900/50">Username: {result.username}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <code
            className="flex-1 select-all break-all rounded-xl border border-border bg-rice-50 px-3 py-2.5 font-mono text-lg tracking-wider"
            aria-label="Temporary password"
          >
            {result.tempPassword}
          </code>
          <Button type="button" size="sm" variant="ghost" onClick={onCopy} className="gap-1.5">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
