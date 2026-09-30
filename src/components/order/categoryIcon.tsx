import { Soup, Egg, Salad, CupSoda, PlusCircle, Flame, Sparkles, UtensilsCrossed, type LucideIcon } from "lucide-react";

// Best-effort icon per menu category, matched by keyword so it keeps
// working as categories are renamed/added in Admin without code changes.
// Order of the checks matters: "Add-Ons" is checked first because it's the
// one category that isn't a food type at all (it's a picker), and
// "Special Meal" is checked last, right before the fallback, because it's
// deliberately the catch-all bucket (see the note on CATEGORY_ORDER below)
// — it should never accidentally steal a match that a more specific keyword
// (lugaw, silog, soup, sizzl, side, drink) would otherwise get.
export function iconForCategory(category: string | undefined): LucideIcon {
  const c = (category ?? "").toLowerCase();
  if (c.includes("add-on") || c.includes("addon") || c.includes("add on")) return PlusCircle;
  if (c.includes("lugaw")) return Soup;
  if (c.includes("silog")) return Egg; // matches "Silog" and "Silog Meals"
  if (c.includes("soup") || c.includes("bulalo") || c.includes("mami")) return Soup;
  if (c.includes("sizzl")) return Flame; // Kuy's Sizzling
  if (c.includes("side") || c.includes("rice")) return Salad;
  if (c.includes("drink") || c.includes("beverage")) return CupSoda;
  if (c.includes("special")) return Sparkles; // Special Meal — the standalone, unboarded items
  return UtensilsCrossed;
}

// Hand-drawn brand icon per menu category, from the kiosk resource pack
// (public/brand/icons). Matched by the same keywords as iconForCategory
// above so a renamed/added category in Admin still gets a sensible icon
// instead of a broken image. The resource pack has no dedicated artwork for
// "Sizzling" or "Special Meal" (they're new categories, not in the original
// icon set), so both intentionally fall through to the generic
// icon-side-order.svg mark rather than misusing an icon drawn for something
// else (e.g. the soup bowl or the egg) — a neutral icon is more honest than
// a wrong one until dedicated art is added.
export function categoryIconSrc(category: string | undefined): string {
  const c = (category ?? "").toLowerCase();
  if (c.includes("add-on") || c.includes("addon") || c.includes("add on")) return "/brand/icons/icon-addons.svg";
  if (c.includes("lugaw")) return "/brand/icons/icon-lugaw.svg";
  if (c.includes("silog")) return "/brand/icons/icon-silog.svg"; // matches "Silog" and "Silog Meals"
  if (c.includes("soup") || c.includes("bulalo") || c.includes("mami")) return "/brand/icons/icon-soup.svg";
  if (c.includes("side") || c.includes("rice")) return "/brand/icons/icon-side-order.svg";
  if (c.includes("drink") || c.includes("beverage")) return "/brand/icons/icon-drinks.svg";
  // Sizzling and Special Meal: no dedicated art yet — same neutral fallback.
  return "/brand/icons/icon-side-order.svg";
}

// Fixed display order for the kiosk category nav. This mirrors the shop's
// OWN counter layout, left to right: the Lugaw board is first (closest to
// where a walk-in customer looks), then the Sizzling board, then Silog
// Meals, then the Soup Menu board, then the combined Side Order/Drinks
// board (Side Order before Drinks, matching the food-before-beverage order
// printed on that board). "Special Meal" comes right after the six named
// boards — it's real, ordinary menu (not a hidden or lesser tier), it just
// covers items the shop never grouped under a shared sign (Chicken Inasal,
// Letchon Manok, Bicol Express, Peking Duck, Laing, Kang Kong, Mr. Baka
// steak, etc.), so it's placed with the other browsable food categories
// instead of buried at the end. "Add-Ons" is pinned last on purpose: unlike
// every other tab, it's never something a customer browses for on its own —
// it only ever appears as a picker triggered from another item (see
// prisma/seed.ts for the full per-category reasoning, and
// backfill-merge-addons-category.ts for why there's only ever ONE Add-Ons
// category instead of one per parent item). Categories not in this list
// (e.g. a brand-new one added later in Admin) are appended at the end,
// alphabetically, so nothing ever silently disappears from the kiosk.
const CATEGORY_ORDER = [
  "Lugaw",
  "Sizzling",
  "Silog Meals",
  "Soup",
  "Side Order",
  "Drinks",
  "Special Meal",
  "Add-Ons",
];

export function sortCategories(categories: string[]): string[] {
  const known = CATEGORY_ORDER.filter((c) => categories.includes(c));
  const extra = categories.filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...known, ...extra];
}
