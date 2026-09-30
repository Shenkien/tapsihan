import { redirect } from "next/navigation";
import { getLiveStaff } from "@/lib/auth";
import ChangePasswordForm from "@/components/auth/ChangePasswordForm";
import BfcacheGuard from "@/components/providers/BfcacheGuard";

// Used two ways: voluntarily (Change password in the header) and forced (an
// account whose password an admin set or reset must replace it before it can
// reach anything else). Uses getLiveStaff() rather than requireRole() because
// requireRole deliberately refuses accounts that still have to change their
// password — this is the one screen they ARE allowed on.
export default async function ChangePasswordPage() {
  const live = await getLiveStaff();
  if (!live) redirect("/login");

  const { staff } = live;
  return (
    <>
      <BfcacheGuard />
      <ChangePasswordForm
        username={staff.username}
        forced={staff.mustChangePassword}
        homePath={staff.role === "ADMIN" ? "/admin" : "/staff"}
        loginPath="/login"
      />
    </>
  );
}
