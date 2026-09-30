import PageHeader from "@/components/admin/PageHeader";
import UsersTab from "@/components/admin/UsersTab";

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="Users"
        description="View every account, deactivate or reactivate access, and reset a forgotten staff password."
      />
      <UsersTab />
    </>
  );
}
