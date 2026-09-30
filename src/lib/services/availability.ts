// One definition of "can this be sold right now", used by the menu endpoints
// (/api/products, /api/combos) and by POST /api/orders. Before this, the menu
// hid items whose ingredient was inactive but the order endpoint would still
// sell them.

/** Stock comparisons tolerate float noise: 0.1 * 3 is 0.30000000000000004. */
export const STOCK_EPSILON = 1e-9;

export function hasEnough(available: number, needed: number): boolean {
  return available + STOCK_EPSILON >= needed;
}

export type IngredientLike = { active: boolean; trackByPiece: boolean; stock: number; pieceStock: number };
export type RecipeLineLike = { qty: number; ingredient: IngredientLike };
export type ProductLike = { active: boolean; recipeItems: RecipeLineLike[] };

/** Stock in the pool a recipe actually draws from. */
export function poolStock(i: Pick<IngredientLike, "trackByPiece" | "stock" | "pieceStock">): number {
  return i.trackByPiece ? i.pieceStock : i.stock;
}

/**
 * A Menu Item is sellable when it is active, has a Recipe, and every recipe
 * ingredient is active with enough stock for `qty` more. Pass `qty` > 1 for a
 * combo component (recipe.qty * qty).
 */
export function isProductAvailable(p: ProductLike, qty = 1): boolean {
  return (
    p.active &&
    p.recipeItems.length > 0 &&
    p.recipeItems.every((r) => r.ingredient.active && hasEnough(poolStock(r.ingredient), r.qty * qty))
  );
}
