import type { Viewport } from "next";

// Overrides the root layout's viewport for this route only — an accidental
// pinch-zoom on an unattended kiosk screen is a bigger problem than a
// customer wanting to zoom in, but the same restriction on admin/staff
// screens (used on phones/laptops by people, not sitting untouched) would
// just be annoying.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: "#fff8ef",
};

// The Staff / Admin login links live on the kiosk welcome screen itself
// (WelcomeScreen in components/order/OrderFlow.tsx). They used to be a
// 10px, 20%-opacity pair pinned to the bottom-right corner of every kiosk
// screen — too small and faint to tap on a phone or tablet, and they sat on
// top of the cart/checkout bar during an order.
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
