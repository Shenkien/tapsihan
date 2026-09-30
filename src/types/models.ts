export type OrderType = "DINE_IN" | "TAKEOUT";
export type OrderSource = "KIOSK" | "QR" | "COUNTER";
export type PaymentMethod = "CASH" | "GCASH";
export type OrderStatus = "CREATED" | "PAID" | "READY" | "COMPLETED" | "CANCELLED";

export type MenuProduct = {
  id: number;
  name: string;
  category: string;
  price: number;
  imageUrl: string | null;
  inStock: boolean;
  bestSeller: boolean;
  isNew: boolean;
  // Set when this line is really a Combo Meal (see MenuCombo below) riding
  // through the cart/checkout pipeline as if it were a single product —
  // that avoids a much bigger rewrite of useCart/Cart/Checkout/usePayment,
  // which only ever need to read name/price/category/imageUrl off a line.
  // `id` in that case is the ComboMeal's id, not a Product id — the two
  // id spaces overlap, so anything comparing cart lines must also compare
  // `isCombo` (see useCart's addItem merge check).
  isCombo?: boolean;
  comboItems?: { name: string; qty: number }[];
};

export type MenuComboItem = {
  productId: number;
  name: string;
  qty: number;
};

// A bundle the kiosk can actually sell, computed from Admin's ComboMeal +
// its components' current prices/availability — for the public /api/combos
// endpoint.
export type MenuCombo = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  items: MenuComboItem[];
  // Sum of the included items' normal prices, so the kiosk can show
  // "Save ₱X" against buying everything separately.
  regularPrice: number;
  savings: number;
  inStock: boolean;
};

export type AdminProduct = {
  id: number;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  imageUrl: string | null;
  description: string | null;
  bestSeller: boolean;
  isNew: boolean;
  active: boolean;
  /** How many Recipe rows this Menu Item has. Every item — including
   *  sold-as-is ones like canned drinks — is expected to have at least
   *  one; 0 means it isn't sellable yet since availability always comes
   *  from its linked Ingredients. */
  recipeItemCount?: number;
};

// Ingredient.unit is a plain string (e.g. "KG", "PIECE") matched by name
// against the UnitOfMeasure maintenance table — not a hard-coded enum.
export type IngredientUnit = string;

export type AdminCategory = {
  id: number;
  name: string;
  type: "INGREDIENT" | "PRODUCT";
  active: boolean;
};

export type AdminUnitOfMeasure = {
  id: number;
  name: string;
  abbreviation: string;
  active: boolean;
};

export type AdminIngredient = {
  id: number;
  name: string;
  category: string;
  unit: IngredientUnit;
  stock: number;
  cost: number;
  lowStockThreshold: number;
  trackByPiece: boolean;
  pieceStock: number;
  piecesPerUnit: number;
  pieceUnitLabel: string;
  active: boolean;
  supplierId?: number | null;
  supplier?: { id: number; name: string } | null;
  // Derived from the newest received PO (GET /api/admin/ingredients only).
  lastPurchase?: { date: string; unitCost: number; supplierName: string } | null;
};

export type AdminIngredientLog = {
  id: number;
  change: number;
  reason: "RESTOCK" | "ADJUSTMENT" | "WASTE" | "SALE";
  target: string;
  note: string | null;
  createdAt: string;
};

export type AdminRecipeItem = {
  id: number;
  ingredientId: number;
  qty: number;
  ingredient: { id: number; name: string; unit: IngredientUnit; stock: number };
};

export type AdminSupplier = {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  _count?: { purchaseOrders: number };
  purchaseOrders?: Omit<AdminPurchaseOrder, "supplier">[];
};

export type AdminPOItem = {
  id: number;
  ingredientId: number;
  qty: number;
  unitCost: number;
  ingredient: { id: number; name: string; unit: IngredientUnit };
};

export type AdminPurchaseOrder = {
  id: number;
  poNumber: string;
  status: "ORDERED" | "RECEIVED" | "CANCELLED";
  totalCost: number;
  createdAt: string;
  expectedDate: string | null;
  receivedAt: string | null;
  supplier: { id: number; name: string };
  items: AdminPOItem[];
};

export type AdminComboItem = {
  id: number;
  productId: number;
  qty: number;
  product: { id: number; name: string };
};

export type AdminCombo = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  active: boolean;
  items: AdminComboItem[];
};

export type ComboSnapshotItem = { name: string; qty: number };

// `product` is null on a combo line and `comboMeal`/`comboItemsSnapshot`
// are null on a regular line — see the OrderItem model comment in
// schema.prisma. Use orderItemName()/orderItemComboContents() below
// instead of reading `product.name` directly, so every display component
// shows either kind of line correctly.
export type OrderItemWithProduct = {
  id: number;
  qty: number;
  notes: string | null;
  unitPrice: number;
  product: { id: number; name: string } | null;
  comboMeal?: { id: number; name: string } | null;
  comboItemsSnapshot?: ComboSnapshotItem[] | null;
};

export function orderItemName(item: OrderItemWithProduct): string {
  return item.comboMeal?.name ?? item.product?.name ?? "Item";
}

// The combo's included items as they were at the time this order was
// placed (from the frozen snapshot), or null for a regular product line.
export function orderItemComboContents(item: OrderItemWithProduct): ComboSnapshotItem[] | null {
  if (!item.comboMeal) return null;
  return Array.isArray(item.comboItemsSnapshot) ? item.comboItemsSnapshot : [];
}

export type PaymentRecord = {
  id: number;
  method: PaymentMethod;
  reference: string | null;
  amountReceived: number | null;
  change: number | null;
  status: string;
  paidAt: string | null;
};

export type OrderRecord = {
  id: number;
  orderNo: string;
  barcode: string;
  type: OrderType;
  source: OrderSource;
  total: number;
  notes: string | null;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  // Set when a counter discount was applied; `total` is already net of it.
  subtotal?: number | null;
  discountName?: string | null;
  discountPercent?: number;
  discountAmount?: number;
  createdAt: string;
  paidAt: string | null;
  receivedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  items: OrderItemWithProduct[];
  payment?: PaymentRecord | null;
};

export type CartItem = { product: MenuProduct; qty: number; notes: string };

// A discount the counter can apply (Senior Citizen, Student, ...).
export type CounterDiscount = {
  id: number;
  name: string;
  percent: number;
};

export type AdminDiscount = CounterDiscount & {
  active: boolean;
};
