import PageHeader from "@/components/admin/PageHeader";
import CategoriesTab from "@/components/admin/CategoriesTab";

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Category Maintenance"
        description="Manage the category lists used by Inventory Items and Menu Items — two separate lists, kept in one place."
      />
      <CategoriesTab />
    </>
  );
}
