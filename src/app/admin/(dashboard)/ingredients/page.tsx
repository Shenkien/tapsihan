import PageHeader from "@/components/admin/PageHeader";
import IngredientsTab from "@/components/admin/IngredientsTab";

export default function IngredientsPage() {
  return (
    <>
      <PageHeader
        title="Inventory Items"
        description="The raw materials and stock items you buy from Suppliers — track stock levels, restock or deduct quantities, and watch for low-stock items."
      />
      <IngredientsTab />
    </>
  );
}
