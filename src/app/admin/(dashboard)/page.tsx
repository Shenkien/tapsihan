import PageHeader from "@/components/admin/PageHeader";
import DashboardTab from "@/components/admin/DashboardTab";

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today's revenue, orders, and stock at a glance — start every shift here."
      />
      <DashboardTab />
    </>
  );
}
