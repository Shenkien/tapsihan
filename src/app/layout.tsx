import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, Permanent_Marker } from "next/font/google";
import "./globals.css";
import AuthSessionProvider from "@/components/providers/AuthSessionProvider";
import OverlayCleanupGuard from "@/components/providers/OverlayCleanupGuard";
import { Toaster } from "@/components/ui/toaster";

const fontDisplay = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

const fontBody = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

// Playful hand-brushed headline face used on the kiosk welcome/promo
// screen only — the poster-style "KUY'S TAPSIHAN" wordmark. Everywhere
// else keeps the Fraunces display font.
const fontMarker = Permanent_Marker({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-marker",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kuy's Tapsihan",
  description: "Kiosk + QR ordering, staff counter, and admin back-office for a Filipino tapsihan.",
  manifest: "/manifest.webmanifest",
  // iOS Safari ignores the manifest's `display` mode entirely — the only
  // way to get rid of its address bar/toolbar on an iPad is launching from
  // a home-screen icon added via Share > Add to Home Screen, and these are
  // the tags that make that launch open full-screen (apple-mobile-web-app-
  // capable) with a matching status bar instead of the plain browser tab.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tapsihan",
  },
};

// viewport-fit=cover lets the page draw under the iPad's rounded corners/
// home indicator area instead of leaving a plain white/black band there;
// pair with `env(safe-area-inset-*)` padding in CSS if content ends up
// tucked under it. Locking zoom is only appropriate on the unattended
// kiosk screen, not here — see src/app/kiosk/layout.tsx for that override.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fff8ef",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontBody.variable} ${fontMarker.variable}`}>
      <body className="bg-rice-50 font-body text-charcoal-900 antialiased">
        <AuthSessionProvider>
          {children}
          <Toaster />
          <OverlayCleanupGuard />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
