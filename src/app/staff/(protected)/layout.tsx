import { redirect } from "next/navigation";
import { checkRole } from "@/lib/auth";
import BfcacheGuard from "@/components/providers/BfcacheGuard";

// Wraps every real /staff screen (the login page lives at /login). Calling
// requireRole() here does two things:
//
// 1. It's a real server-side session check on every navigation to these
//    pages — not just the redirect proxy.ts does before the route handler
//    runs. checkRole() re-reads the staff row from the DB, so a
//    deactivated/demoted account, or one whose password changed after this
//    session began, is caught immediately, same as every other
//    requireRole()-gated route. An account that still has to change its
//    password is sent to /change-password instead of the login screen.
// 2. Calling auth() (which checkRole wraps) makes Next.js treat this
//    layout's routes as dynamic, so the response gets
//    `Cache-Control: no-store`. Without that, the browser's back/forward
//    cache (bfcache) can restore an authenticated page's DOM straight from
//    memory on Back — including after logout — without ever asking the
//    server again, so proxy.ts never gets a chance to run.
export default async function StaffProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const check = await checkRole(["STAFF", "ADMIN"]);
  if (!check.ok) {
    redirect(check.reason === "must_change_password" ? "/change-password" : "/login");
  }

  return (
    <>
      <BfcacheGuard />
      {children}
    </>
  );
}
