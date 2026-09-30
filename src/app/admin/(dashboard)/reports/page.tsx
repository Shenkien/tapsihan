import PageHeader from "@/components/admin/PageHeader";
import ReportsTab from "@/components/admin/ReportsTab";

export default function SalesReportsPage() {
  return (
    <>
      <PageHeader
        title="Sales Reports"
        description="Revenue, best sellers, and payment-method breakdowns — pick a period to get started."
      />
      <ReportsTab />
    </>
  );
}
