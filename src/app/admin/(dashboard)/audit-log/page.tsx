import PageHeader from "@/components/admin/PageHeader";
import AuditLogTab from "@/components/admin/AuditLogTab";

export default function AuditLogPage() {
  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Who changed what, when — user account management, menu price changes, and purchase order receiving."
      />
      <AuditLogTab />
    </>
  );
}
