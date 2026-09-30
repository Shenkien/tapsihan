import { redirect } from "next/navigation";

// The staff and admin logins were merged into one page at /login. This stays
// only so old bookmarks keep working.
export default async function OldLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ fresh?: string; changed?: string }>;
}) {
  const { fresh, changed } = await searchParams;
  const qs = new URLSearchParams();
  if (fresh) qs.set("fresh", fresh);
  if (changed) qs.set("changed", changed);
  const q = qs.toString();
  redirect(q ? `/login?${q}` : "/login");
}
