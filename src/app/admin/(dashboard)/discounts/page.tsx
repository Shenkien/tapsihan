import PageHeader from "@/components/admin/PageHeader";
import DiscountsTab from "@/components/admin/DiscountsTab";

export default function DiscountsPage() {
  return (
    <>
      <PageHeader
        title="Discounts"
        description="Set the discounts the counter can apply at payment — Senior Citizen, Student, and any others. Staff pick from the active ones; only you can change the percentages."
      />
      <DiscountsTab />
    </>
  );
}
