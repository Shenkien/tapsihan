import { headers } from "next/headers";
import LoginForm from "@/components/auth/LoginForm";

// One login for everybody. The account's role decides where it lands after
// signing in: admins go to /admin, staff go to the counter at /staff.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ fresh?: string; changed?: string }>;
}) {
  const { fresh, changed } = await searchParams;

  // ?fresh=1 signs out any old session, which the kiosk's login link relies
  // on. A link on another website must not be able to log someone out, so it
  // is only honoured when the browser says the visit came from this site
  // ("same-origin", the kiosk link) or was typed/bookmarked ("none"). Browsers
  // that don't send the header keep the old behaviour.
  const site = (await headers()).get("sec-fetch-site");
  const trusted = site === null || site === "same-origin" || site === "none";

  return (
    <LoginForm
      clearExistingSession={fresh === "1" && trusted}
      notice={changed === "1" ? "Password changed. Log in with your new password." : undefined}
    />
  );
}
