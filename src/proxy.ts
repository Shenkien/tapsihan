import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Next.js 16 renamed middleware.ts -> proxy.ts. Protects the /staff and
// /admin screens and the /change-password screen. /login is open to everyone.
//
// This is the FIRST gate and only reads the signed cookie. It can't tell that
// an account was deactivated or its password just changed — the layouts and
// every API route re-check the database (getLiveStaff in src/lib/auth.ts),
// which is the check that actually counts.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;
  const role = user?.role;

  if (pathname === "/change-password") {
    if (!role) return NextResponse.redirect(new URL("/login", req.url));
    return NextResponse.next();
  }

  // An account on an admin-chosen password can only reach the change screen.
  if (role && user?.mustChangePassword) {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  if (pathname.startsWith("/staff")) {
    if (!role) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if (pathname.startsWith("/admin")) {
    if (!role) return NextResponse.redirect(new URL("/login", req.url));
    // Signed in, but as staff: send them to the counter, not a login loop.
    if (role !== "ADMIN") return NextResponse.redirect(new URL("/staff", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/staff/:path*", "/admin/:path*", "/change-password"],
};
