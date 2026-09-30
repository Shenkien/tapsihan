import PageHeader from "@/components/admin/PageHeader";
import PurchaseOrdersTab from "@/components/admin/PurchaseOrdersTab";

export default function PurchaseOrdersPage() {
  return (
    <>
      <PageHeader
        title="Purchase Orders"
        description="Order stock from a supplier and receive it — receiving a PO automatically restocks every line item."
      />
      <PurchaseOrdersTab />
    </>
  );
}
