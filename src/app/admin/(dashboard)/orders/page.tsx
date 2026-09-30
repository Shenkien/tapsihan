import PageHeader from "@/components/admin/PageHeader";
import OrdersTab from "@/components/admin/OrdersTab";

export default function OrderHistoryPage() {
  return (
    <>
      <PageHeader
        title="Order History"
        description="Every order ever placed — search by order number, filter by status, channel, or payment status. Unlike the kitchen queue, completed and cancelled orders stay here."
      />
      <OrdersTab />
    </>
  );
}
