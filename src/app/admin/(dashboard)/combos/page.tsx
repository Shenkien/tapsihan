import PageHeader from "@/components/admin/PageHeader";

// Combo Meals is turned off for now — the admin nav link was removed too
// (see src/components/admin/nav.ts). Nothing else in the system needs a
// combo to exist, so this is a simple, reversible hide: the CombosTab
// component, the /api/admin/combos routes, and the ComboMeal database
// table are all still here untouched. To bring it back, restore the nav
// item and swap this page (and combos/new, combos/[id]/edit) back to
// rendering <CombosTab /> / <ComboMealForm />.
export default function CombosPage() {
  return (
    <>
      <PageHeader title="Combo Meals" description="This feature is currently turned off." />
      <p className="text-sm text-charcoal-900/50">
        Combo Meals management is disabled. Menu items can still be sold individually as usual.
      </p>
    </>
  );
}
