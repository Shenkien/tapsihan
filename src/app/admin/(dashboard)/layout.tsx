import { redirect } from "next/navigation";
import { checkRole } from "@/lib/auth";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminSidebar from "@/components/admin/AdminSidebar";
import BfcacheGuard from "@/components/providers/BfcacheGuard";

// Same reasoning as src/app/staff/(protected)/layout.tsx: this layout
// previously rendered with no auth check of its own, relying entirely on
// proxy.ts's redirect. Since nothing here touched cookies/session, Next
// had no reason to mark the route dynamic, so the response had no
// `Cache-Control: no-store` — meaning the browser's bfcache could restore
// this authenticated dashboard on Back after logout without ever asking
// the server again. Calling requireRole() here re-verifies the session on
// every navigation (catching a deactivated/demoted admin, a password that
// changed after this session began, or an account that still has to change
// its password) and makes Next.js treat the route as dynamic, which stops
// that caching.
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const check = await checkRole(["ADMIN"]);
  if (!check.ok) {
    redirect(check.reason === "must_change_password" ? "/change-password" : "/login");
  }

  return (
    <div className="screen bg-rice-50">
      <BfcacheGuard />
      <AdminHeader />
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
