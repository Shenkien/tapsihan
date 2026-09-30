import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Shortens the handful of legacy enum-style values ("KG" -> "kg"). Anything
// added later through Unit of Measure Maintenance won't be in this map —
// it just falls back to showing its own abbreviation as typed.
const UNIT_LABELS: Record<string, string> = {
  PIECE: "pc",
  KG: "kg",
  G: "g",
  L: "L",
  ML: "mL",
  PACK: "pack",
  BULK: "bulk",
};

/** Short display label for an Ingredient's unit, e.g. "kg", "pc". */
export function unitLabel(unit: string) {
  return UNIT_LABELS[unit] ?? unit;
}

// --- Recipe costing -------------------------------------------------------
// An Ingredient's `cost` is always priced per its bulk purchase `unit` (per
// kg, per L, per piece, per pack — whatever Inventory Item Maintenance says).
// A Recipe's `qty` for that ingredient is entered in that SAME unit, unless
// the ingredient is piece-tracked (`trackByPiece`), in which case Recipe qty
// is in pieces instead — so the purchase cost needs converting down to a
// single piece first via `piecesPerUnit` (e.g. ₱750/kg ÷ 10 pcs/kg = ₱75/pc).
// Getting an accurate number out of this depends entirely on Inventory Item
// Maintenance being filled in at a granularity that matches how much of the
// ingredient a serving actually uses (e.g. an ingredient used a few grams at
// a time is easier to cost accurately when its unit is "g", not "kg").

type CostableIngredient = { cost: number; trackByPiece: boolean; piecesPerUnit: number };

/** Cost of one Recipe-qty unit of this ingredient (one kg, one piece, etc). */
export function ingredientUnitCost(ingredient: CostableIngredient): number {
  return ingredient.trackByPiece ? ingredient.cost / (ingredient.piecesPerUnit || 1) : ingredient.cost;
}

/** Cost contributed by one Recipe row: qty × the ingredient's per-unit cost. */
export function recipeItemCost(ingredient: CostableIngredient, qty: number): number {
  return ingredientUnitCost(ingredient) * qty;
}

// Display label for where an order came from — the kiosk, a customer's own
// phone via QR, or staff entering a walk-in's order at the counter.
const SOURCE_LABELS: Record<string, string> = {
  KIOSK: "Kiosk",
  QR: "QR order",
  COUNTER: "Counter",
};

export function orderSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

// Short relative time for order cards, e.g. "just now", "5m ago", "2h ago".
export function formatRelativeShort(iso: string) {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}
