"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, getSession, signOut } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogoStacked } from "@/components/logo";

export default function LoginForm({
  clearExistingSession = false,
  notice,
}: {
  /**
   * Set when arriving from the kiosk's login link (?fresh=1). Any session
   * left over from an earlier login is dropped so the person always has to
   * log in, instead of the link silently landing in a dashboard.
   */
  clearExistingSession?: boolean;
  /** Friendly message shown above the form, e.g. after a password change. */
  notice?: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  // Submit stays disabled until the old session is gone, so a fast login
  // can't be wiped out by the clean-up finishing afterwards.
  const [clearing, setClearing] = useState(clearExistingSession);
  const router = useRouter();

  useEffect(() => {
    if (!clearExistingSession) return;
    let cancelled = false;
    signOut({ redirect: false })
      .catch((err) => console.error("Couldn't clear old session:", err))
      .finally(() => {
        if (!cancelled) setClearing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clearExistingSession]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() && !password) {
      setError("Enter your username and password");
      return;
    }
    if (!username.trim()) {
      setError("Enter your username");
      return;
    }
    if (!password) {
      setError("Enter your password");
      return;
    }
    setSubmitting(true);

    try {
      const res = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
      });

      // `!res` matters as much as `res.error`: signIn can resolve undefined,
      // and the old `if (res?.error)` treated that as success and navigated
      // away from a login that never happened.
      if (!res || res.error) {
        // The server tags a lockout with code "locked"; every other failure
        // (wrong password, unknown user, deactivated) is deliberately the
        // same message so the screen never says which one it was.
        const code = (res as { code?: string } | undefined)?.code;
        setError(
          code === "locked"
            ? "Too many failed attempts. Please wait about 15 minutes, or ask an admin to reset your password."
            : "Invalid username or password"
        );
        return;
      }

      // One session read tells us where to send them: the role picks the
      // destination, and a forced password change comes first.
      const session = await getSession();
      const role = session?.user?.role;

      if (session?.user?.mustChangePassword) {
        router.replace("/change-password");
        router.refresh();
        return;
      }

      // Same door for everyone — the role decides the room.
      router.replace(role === "ADMIN" ? "/admin" : "/staff");
      router.refresh();
    } catch (err) {
      // Previously unhandled: a network blip threw out of handleSubmit before
      // setSubmitting(false) ran, leaving the button stuck on "Logging in…"
      // with no way to retry short of reloading.
      console.error("Login failed:", err);
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-brand-pattern screen items-center justify-center bg-leaf-900">
      <form
        onSubmit={handleSubmit}
        className="flex w-80 flex-col gap-4 rounded-3xl border border-border bg-white p-8 shadow-brand"
      >
        <div className="flex justify-center">
          <LogoStacked className="h-24 w-auto" />
        </div>
        <h2 className="text-center text-2xl">Staff &amp; Admin Login</h2>
        {notice && (
          <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            {notice}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username" required filled={username.trim().length > 0}>
            Username
          </Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" required filled={password.length > 0}>
              Password
            </Label>
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-xs text-charcoal-900/60 underline-offset-2 hover:text-achuete-600 hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-charcoal-900/50 hover:text-charcoal-900"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={submitting || clearing}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forgot your password?</DialogTitle>
          </DialogHeader>
          {/*
            There's no email on file for staff accounts and no email
            sending set up in this app, so a self-service "reset link"
            flow isn't possible yet. What already exists is the
            admin-mediated reset in Admin → Users ("reset a forgotten
            password" — see UsersTab / /api/admin/staff/[id]/reset-password),
            so this just points people at that instead of promising
            something the app can't do.
          */}
          <p className="text-sm text-charcoal-900/80">
            <span className="font-semibold">Staff:</span> ask an admin to reset your password from{" "}
            <span className="font-semibold">Admin → Users</span> (find your account and use{" "}
            <span className="font-semibold">Reset password</span>).
          </p>
          <p className="text-sm text-charcoal-900/80">
            <span className="font-semibold">Admins:</span> for safety, an admin password can&apos;t be reset from the
            dashboard. Whoever manages the server can reset it from the server console with{" "}
            <code className="rounded bg-rice-100 px-1 py-0.5 text-xs">npm run auth -- reset your-username</code> (see
            the README).
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
