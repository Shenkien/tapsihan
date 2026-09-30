import PageHeader from "@/components/admin/PageHeader";
import QrOrderingTab from "@/components/admin/QrOrderingTab";

export default function QrOrderingPage() {
  return (
    <>
      <PageHeader
        title="QR Ordering"
        description="A QR code customers scan with their own phone to order — the same menu/checkout flow as the kiosk, at src/app/order/page.tsx. Print this for table tents, the counter, or anywhere else customers can scan it."
      />
      <QrOrderingTab />
    </>
  );
}
