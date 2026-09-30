import { signOut } from "next-auth/react";

/**
 * Signs out, then does a hard navigation that REPLACES the current history
 * entry with the login page.
 *
 * signOut({ callbackUrl }) used to be used here. It pushes the login page as
 * a new entry on top of the dashboard, so the browser's Back button returned
 * to the dashboard entry — and the browser/Next router could repaint that
 * page from memory without asking the server, looking "still logged in".
 *
 * With replace(), the dashboard entry the person logged out from no longer
 * exists: Back goes to whatever came before it (the kiosk, or an older admin
 * page, which the server then bounces to the login). The full page load also
 * throws away Next's in-memory router cache.
 */
export async function logoutAndGoTo(loginPath: string) {
  try {
    await signOut({ redirect: false });
  } catch (err) {
    console.error("Sign-out request failed:", err);
  }
  window.location.replace(loginPath);
}
