import { z } from "zod";
import { passwordPolicyError } from "@/lib/password-policy";

// Display names (menu items, categories, ingredients, suppliers, units) share
// the same shape: readable words, not symbol-soup — but until now only
// length was ever checked, so junk like "543534535" or "adawd2525]apdp a da
// dw" could be typed straight into any of these fields and would show up
// as-is on the customer-facing kiosk. This requires at least one letter and
// only allows characters that appear in real names. It can't catch a
// typo'd-but-plausible word, only screen out clearly non-name input.
// `+ % ! # :` are allowed so real menu names like "Tapsilog + Drink Combo" or
// "Buy 1 Take 1: Chicken" can be saved; angle brackets, quotes-as-markup and
// control characters stay out.
const NAME_CHARS = /^[\p{L}\p{N} .,()/&'+%!#:-]+$/u;
const NAME_CHARS_HINT = "letters, numbers, spaces, and . , ( ) / & ' + % ! # : -";
function properName(min: number, max: number, label: string) {
  return z
    .string()
    .trim()
    .min(min, `${label} is required`)
    .max(max)
    .regex(NAME_CHARS, `${label} can only contain ${NAME_CHARS_HINT}`)
    .refine((v) => /\p{L}/u.test(v), { message: `${label} must contain at least one letter` });
}

// Same shape as properName, but for a field that's allowed to be left blank
// entirely (empty/null both mean "not provided") — only validates the
// format once something has actually been typed.
function optionalProperName(max: number, label: string) {
  return z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.trim() : v || null))
    .refine((v) => !v || v.length <= max, { message: `${label} is too long` })
    .refine((v) => !v || NAME_CHARS.test(v), {
      message: `${label} can only contain ${NAME_CHARS_HINT}`,
    })
    .refine((v) => !v || /\p{L}/u.test(v), { message: `${label} must contain at least one letter` });
}

// ---------------------------------------------------------- shared rules ---

// Money: pesos with at most 2 decimals. (multipleOf(0.01) trips on float
// error, so compare after rounding instead.)
const twoDecimals = (v: number) => Math.round(v * 100) / 100 === v;
const moneyAmount = (max: number, tooHigh?: string, required?: string) =>
  z
    .number(required ? { error: required } : undefined)
    .nonnegative()
    .max(max, tooHigh)
    .refine(twoDecimals, "Max 2 decimal places");

// Quantities and stock levels (kg, cups, pieces...): at most 4 decimals, so
// float dust like 0.30000000000000004 can't be stored.
const fourDecimals = (v: number) => Math.round(v * 10_000) / 10_000 === v;
const quantity = (max = 1_000_000, required?: string) =>
  z
    .number(required ? { error: required } : undefined)
    .nonnegative()
    .max(max)
    .refine(fourDecimals, "Max 4 decimal places");
const positiveQuantity = (max = 1_000_000) =>
  z.number().positive().max(max).refine(fourDecimals, "Max 4 decimal places");

// Uploaded images live on Vercel Blob (POST /api/upload) and next/image only
// allows that host, so anything else would make the kiosk card throw at
// render. https only: rules out javascript: and data: URLs.
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const blobImageUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((u) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" && x.hostname.endsWith(BLOB_HOST_SUFFIX);
    } catch {
      return false;
    }
  }, "Use an image uploaded through the upload button");

// Free-text notes end up on printed tickets: turn tabs/newlines/other control
// characters into spaces so a note can't break the ticket layout.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]+/g;
const cleanNote = (max: number, tooLong: string) =>
  z
    .string()
    .max(max * 2, tooLong)
    .transform((v) => v.replace(CONTROL_CHARS, " ").trim())
    .refine((v) => v.length <= max, tooLong);

// A line references EITHER a regular Menu Item OR a Combo Meal bundle,
// never both/neither — Prisma's schema can't express that "exactly one
// of" constraint on OrderItem, so it's enforced here instead.
export const orderItemSchema = z
  .object({
    productId: z.number().int().positive().optional(),
    comboMealId: z.number().int().positive().optional(),
    // Cap at 50 per line — a real kiosk order will never need more, and it
    // stops a malformed/malicious request from creating an absurd order.
    qty: z.number().int().positive().max(50, "Quantity is too high"),
    notes: cleanNote(200, "Note is too long").optional(),
  })
  .refine((data) => (data.productId ? 1 : 0) + (data.comboMealId ? 1 : 0) === 1, {
    message: "Each order line must reference exactly one menu item or combo",
  });

export const createOrderSchema = z.object({
  type: z.enum(["DINE_IN", "TAKEOUT"]),
  source: z.enum(["KIOSK", "QR", "COUNTER"]),
  paymentMethod: z.enum(["CASH", "GCASH"]),
  notes: cleanNote(500, "Note is too long").optional(),
  items: z.array(orderItemSchema).min(1, "At least one item is required").max(100),
}).refine(
  // Total portions across all lines (each line is already capped at 50).
  // Counter orders (staff, signed in) may be bigger, e.g. a catering order.
  (o) => o.items.reduce((n, i) => n + i.qty, 0) <= (o.source === "COUNTER" ? 200 : 50),
  { message: "That's too many items in one order. Please split it into two orders." }
);

// Money typed by staff: pesos with at most 2 decimals. (multipleOf(0.01)
// trips on float error, so compare after rounding instead.)
const pesoAmount = z
  .number()
  .positive("Enter the amount received")
  .max(1_000_000)
  .refine(twoDecimals, "Max 2 decimal places");

const orderNoParam = z.string().trim().regex(/^\d{4,10}$/, "Invalid order number");

export const confirmCashSchema = z.object({
  orderNo: orderNoParam,
  amountReceived: pesoAmount,
});

// GCash confirmation. The store's QR is a static merchant code, so nothing
// links a payment to an order except what staff read off the customer's
// payment screen: the GCash reference number and the amount actually sent.
// GCash reference numbers are 13 digits; the app shows them in groups
// ("1234 567 890123"), so spaces are stripped before checking. The number
// must be unique (Payment.gcashRef), so require the full 13 digits.
export const GCASH_REF_LENGTH = 13;
export const confirmGcashSchema = z.object({
  orderNo: orderNoParam,
  gcashRef: z
    .string()
    .transform((s) => s.replace(/\s+/g, ""))
    .pipe(
      z.string().regex(
        new RegExp(`^[0-9]{${GCASH_REF_LENGTH}}$`),
        `Enter the ${GCASH_REF_LENGTH}-digit GCash reference number (digits only)`
      )
    ),
  amountReceived: pesoAmount,
});

export const orderIdSchema = z.object({
  orderId: z.number().int().positive(),
});

// Customer cancelling their own unpaid order: the order number plus the secret
// the kiosk/phone was given when the order was created (24 random bytes,
// base64url = 32 characters).
export const customerCancelSchema = z.object({
  orderNo: orderNoParam,
  token: z.string().trim().regex(/^[A-Za-z0-9_-]{20,64}$/, "Invalid token"),
});

// Admin > Maintenance > GCash Payment. qrImageUrl is required — an admin
// must upload the store's QR image (via POST /api/upload) before saving;
// accountName/accountNumber are optional labels shown under the QR at
// checkout so a customer can double-check they're paying the right
// account, the same way GCash's own "My Personal QR" screen shows a name
// and masked number under the code.
export const updateGcashSettingsSchema = z.object({
  // The image every customer pays to: must be one of our own uploads.
  qrImageUrl: z.string().trim().min(1, "Upload a QR code image first").pipe(blobImageUrl),
  accountName: optionalProperName(100, "Account name"),
  accountNumber: z
    .string()
    .trim()
    .regex(/^[0-9 +-]{0,30}$/, "Account number can only contain digits, spaces, + and -")
    .optional(),
});

export const createProductSchema = z.object({
  name: properName(1, 120, "Name"),
  category: properName(1, 80, "Category"),
  price: moneyAmount(100_000, "Price looks too high"),
  cost: moneyAmount(100_000).optional(),
  imageUrl: blobImageUrl.optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  bestSeller: z.boolean().optional(),
  isNew: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const updateProductSchema = z.object({
  name: properName(1, 120, "Name").optional(),
  category: properName(1, 80, "Category").optional(),
  price: moneyAmount(100_000, "Price looks too high").optional(),
  cost: moneyAmount(100_000).optional(),
  imageUrl: blobImageUrl.optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  bestSeller: z.boolean().optional(),
  isNew: z.boolean().optional(),
  active: z.boolean().optional(),
});

// PH landline/mobile numbers only really vary 7–11 digits (e.g. a mobile
// "09171234567" is 11 digits, a landline can be shorter) — digits only, no
// spaces/dashes/letters. Empty string/null/undefined are all "not provided".
const optionalPhone = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v.trim() : v || null))
  .refine((v) => !v || /^[0-9]{7,11}$/.test(v), {
    message: "Phone must be 7–11 digits, numbers only",
  });

const optionalEmail = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v.trim() : v || null))
  .refine((v) => !v || z.email().safeParse(v).success, {
    message: "Enter a valid email address",
  });

export const createSupplierSchema = z.object({
  name: properName(1, 120, "Supplier name"),
  contactPerson: optionalProperName(120, "Contact person"),
  phone: optionalPhone,
  email: optionalEmail,
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const poItemSchema = z.object({
  ingredientId: z.number().int().positive(),
  // Ingredients are bought by kilo/bulk as well as by the piece, so unlike
  // a Menu Item order this allows fractional quantities (e.g. 2.5 kg).
  qty: positiveQuantity(),
  unitCost: moneyAmount(1_000_000),
});

// "YYYY-MM-DD" that is a real calendar day. new Date("2026-02-31") silently
// becomes 2026-03-03 and "2026-13-45" is Invalid Date (Prisma then throws), so
// round-trip through ISO and require the same string back.
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected delivery date is not valid")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, "Expected delivery date is not a real date");

export const createPurchaseOrderSchema = z.object({
  supplierId: z.number().int().positive(),
  items: z.array(poItemSchema).min(1, "Add at least one line item").max(200),
  // Optional "YYYY-MM-DD" from the date picker; blank/omitted = no date.
  expectedDate: calendarDate.optional().nullable(),
});

export const comboItemSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().positive().max(50),
});

export const createComboSchema = z.object({
  name: properName(1, 120, "Name"),
  description: z.string().trim().max(2000).optional().nullable(),
  imageUrl: blobImageUrl.optional().nullable(),
  price: moneyAmount(100_000, "Price looks too high"),
  active: z.boolean().optional(),
  items: z.array(comboItemSchema).min(1, "Add at least one menu item").max(50),
});

export const updateComboSchema = z.object({
  name: properName(1, 120, "Name").optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  imageUrl: blobImageUrl.optional().nullable(),
  price: moneyAmount(100_000, "Price looks too high").optional(),
  active: z.boolean().optional(),
  items: z.array(comboItemSchema).min(1, "Add at least one menu item").max(50).optional(),
});

// Units are a maintained pick-list now (Unit of Measure Maintenance), not a
// fixed enum, so any non-empty abbreviation the user has defined is valid.
export const ingredientUnitSchema = z.string().trim().min(1).max(20);

export const categoryTypeSchema = z.enum(["INGREDIENT", "PRODUCT"]);

export const createCategorySchema = z.object({
  name: properName(1, 80, "Name"),
  type: categoryTypeSchema,
});

export const updateCategorySchema = z.object({
  name: properName(1, 80, "Name").optional(),
  active: z.boolean().optional(),
});

export const createUnitSchema = z.object({
  name: properName(1, 80, "Name"),
  abbreviation: properName(1, 20, "Abbreviation"),
});

export const updateUnitSchema = z.object({
  name: properName(1, 80, "Name").optional(),
  abbreviation: properName(1, 20, "Abbreviation").optional(),
  active: z.boolean().optional(),
});

export const createIngredientSchema = z.object({
  name: properName(1, 120, "Name"),
  category: properName(1, 80, "Category").optional(),
  unit: ingredientUnitSchema,
  stock: quantity(1_000_000, "Starting stock is required"),
  cost: moneyAmount(1_000_000, undefined, "Cost is required"),
  lowStockThreshold: quantity(1_000_000, "Reorder level is required"),
  trackByPiece: z.boolean().optional(),
  pieceStock: quantity().optional(),
  piecesPerUnit: positiveQuantity().optional(),
  pieceUnitLabel: properName(1, 40, "Piece unit label").optional(),
  // Usual supplier — optional, null/omitted = none.
  supplierId: z.number().int().positive().nullable().optional(),
});

export const updateIngredientSchema = z.object({
  name: properName(1, 120, "Name").optional(),
  category: properName(1, 80, "Category").optional(),
  unit: ingredientUnitSchema.optional(),
  cost: moneyAmount(1_000_000).optional(),
  lowStockThreshold: quantity().optional(),
  active: z.boolean().optional(),
  trackByPiece: z.boolean().optional(),
  piecesPerUnit: positiveQuantity().optional(),
  pieceUnitLabel: properName(1, 40, "Piece unit label").optional(),
  supplierId: z.number().int().positive().nullable().optional(),
});

export const ingredientAdjustSchema = z.object({
  change: z.number().min(-1_000_000).max(1_000_000).refine(fourDecimals, "Max 4 decimal places").refine((v) => v !== 0, "Change can't be 0"),
  reason: z.enum(["RESTOCK", "ADJUSTMENT", "WASTE"]),
  target: z.enum(["stock", "pieceStock"]).optional(),
  // Optional free-text reason shown in the item's stock history.
  note: z.string().trim().max(200).optional(),
});

export const recipeItemInputSchema = z.object({
  ingredientId: z.number().int().positive(),
  qty: positiveQuantity(),
});

export const updateRecipeSchema = z.object({
  items: z.array(recipeItemInputSchema).max(100),
});

// Staff usernames are stored lowercased (createStaffSchema does
// `.toLowerCase()` before saving), but this was comparing whatever case the
// person typed at login against that lowercase value. "JDoe" would fail to
// match a "jdoe" account and just report "Invalid username or password" —
// lowercasing here keeps login case-insensitive the same way the account
// was created.
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(80),
  password: z.string().min(1).max(200),
});

export const simulateGcashPaidSchema = z.object({
  orderNo: orderNoParam,
});

// Usernames double as login IDs — keep them to a predictable, URL/shell
// safe character set (letters, numbers, dot, underscore, dash) so they
// can't smuggle in whitespace or punctuation that'd make two "different"
// usernames actually collide after trimming/normalizing.
//
// The password is checked against the shared policy (lib/password-policy.ts —
// length, letter+number, not common, not the username, and at most 72 BYTES
// because bcrypt ignores anything past that). Every admin action that changes
// an account also needs `confirmPassword`: the acting admin's OWN password.
export const createStaffSchema = z
  .object({
    name: properName(1, 120, "Name"),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "Username must be at least 3 characters")
      .max(40)
      .regex(/^[a-z0-9._-]+$/, "Username can only contain letters, numbers, dots, - and _"),
    password: z.string().max(200),
    role: z.enum(["STAFF", "ADMIN"]),
    confirmPassword: z.string().min(1, "Enter your own password to confirm").max(200),
  })
  .superRefine((data, ctx) => {
    const problem = passwordPolicyError(data.password, { username: data.username });
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["password"] });
  });

/** Body for the routes that only need the acting admin to re-confirm. */
export const reauthSchema = z.object({
  confirmPassword: z.string().min(1, "Enter your own password to confirm").max(200),
});

/**
 * Deactivate/reactivate. `active` is the state to set. It is optional only so
 * an old client still works (it then toggles), but a double-click on a toggle
 * flips the account back, so the Users screen now always sends it.
 */
export const setStaffActiveSchema = reauthSchema.extend({ active: z.boolean().optional() });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(200),
  newPassword: z.string().max(200),
});


// ------------------------------------------------------------- discounts ---

export const createDiscountSchema = z.object({
  name: properName(2, 60, "Name"),
  percent: z
    .number({ error: "Enter a percentage" })
    .gt(0, "Percentage must be more than 0")
    .lte(100, "Percentage can't be more than 100"),
});

export const updateDiscountSchema = z.object({
  name: properName(2, 60, "Name").optional(),
  percent: z
    .number({ error: "Enter a percentage" })
    .gt(0, "Percentage must be more than 0")
    .lte(100, "Percentage can't be more than 100")
    .optional(),
  active: z.boolean().optional(),
});

// discountId null = take the discount off again.
export const applyDiscountSchema = z.object({
  orderNo: orderNoParam,
  discountId: z.number().int().positive().nullable(),
});
