import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Never let the browser keep a copy of the staff/admin pages: after logout,
    // Back must hit the server (which redirects to the login), not repaint.
    const noStore = [{ key: "Cache-Control", value: "no-store, must-revalidate" }];

    // The sign-in, account and admin surfaces must never be shown inside
    // someone else's page (clickjacking), and shouldn't leak their URLs.
    // Deliberately NOT applied site-wide: the kiosk and print bridge are left
    // alone so nothing there that relies on framing or on referrers breaks.
    const hardening = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
    ];

    return [
      { source: "/admin/:path*", headers: [...noStore, ...hardening] },
      { source: "/staff/:path*", headers: [...noStore, ...hardening] },
      { source: "/change-password", headers: [...noStore, ...hardening] },
      { source: "/api/admin/:path*", headers: [...noStore, ...hardening] },
      { source: "/api/account/:path*", headers: [...noStore, ...hardening] },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
