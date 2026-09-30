import PageHeader from "@/components/admin/PageHeader";
import UnitsTab from "@/components/admin/UnitsTab";

export default function UnitsPage() {
  return (
    <>
      <PageHeader
        title="Unit of Measure Maintenance"
        description="Manage the units Inventory Items are bought and stocked in — feeds the Unit dropdown on the Inventory Items page."
      />
      <UnitsTab />
    </>
  );
}
