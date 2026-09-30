import PageHeader from "@/components/admin/PageHeader";
import RecipesTab from "@/components/admin/RecipesTab";

export default function RecipesPage() {
  return (
    <>
      <PageHeader
        title="Recipes"
        description="Link each menu item to the inventory items (and quantities) it consumes per order. This powers automatic inventory deduction when orders are placed."
      />
      <RecipesTab />
    </>
  );
}
