import PageHeader from "@/components/admin/PageHeader";

// Combo Meals is turned off — see the note in combos/page.tsx.
export default function NewComboPage() {
  return (
    <>
      <PageHeader title="New Combo Meal" description="This feature is currently turned off." />
      <p className="text-sm text-charcoal-900/50">Combo Meals management is disabled.</p>
    </>
  );
}
