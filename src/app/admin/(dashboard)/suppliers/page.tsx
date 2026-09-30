import PageHeader from "@/components/admin/PageHeader";
import SuppliersTab from "@/components/admin/SuppliersTab";

export default function SuppliersPage() {
  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who you buy ingredients from — linked to Purchase Orders so every restock traces back to where it came from."
      />
      <SuppliersTab />
    </>
  );
}
