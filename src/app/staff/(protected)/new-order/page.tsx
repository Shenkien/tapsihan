import OrderFlow from "@/components/order/OrderFlow";

// Same order-taking flow as the kiosk (menu → cart → checkout), just
// reached from the Staff screen for a walk-in customer who didn't order
// through the kiosk or QR themselves. Protected by proxy.ts's /staff/:path*
// matcher, and by the requireRole() check in the (protected) layout above
// this page, which is what actually stops the browser from serving a
// cached, already-authenticated copy of this page after logout.
export default function StaffNewOrderPage() {
  return <OrderFlow source="COUNTER" />;
}
