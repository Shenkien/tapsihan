import PageHeader from "@/components/admin/PageHeader";
import GcashPaymentTab from "@/components/admin/GcashPaymentTab";

export default function GcashPaymentPage() {
  return (
    <>
      <PageHeader
        title="GCash Payment Maintenance"
        description="The QR code and account details shown to customers on the kiosk/QR checkout screen when they choose to pay with GCash."
      />
      <GcashPaymentTab />
    </>
  );
}
