import PageHeader from "@/components/admin/PageHeader";
import ProductsTab from "@/components/admin/ProductsTab";

export default function MenuItemsPage() {
  return (
    <>
      <PageHeader title="Menu Items" description="Search, price, and manage every item on the menu." />
      <ProductsTab />
    </>
  );
}
