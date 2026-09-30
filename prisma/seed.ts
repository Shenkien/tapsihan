import "dotenv/config"; // load DATABASE_URL from .env when run through tsx
import { PrismaClient } from "@prisma/client";
import { hashPassword, generateTempPassword } from "../src/lib/passwords";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// MENU ITEM CATEGORIES — transcribed from the shop's OWN physical signage
// (the hanging menu boards photographed at the counter), not invented by
// this app. Each one exists here for a specific, traceable reason — this
// list is the thing to point at if a panelist/reviewer asks "why does this
// category exist / why is it named that / why isn't X its own category":
//
//   Lugaw        -> its own dedicated board, headed "LUGAW" (plain, egg,
//                    arozzcaldo, tuwalya, laman loob, lomo, lechon, bulaklak,
//                    overload).
//   Sizzling     -> its own dedicated board, headed "KUY'S SIZZLING"
//                    (liempo, porkchop, pork rbq, chicken quarter/wings,
//                    beef tapa, porksisig, sausage, bangus, tahong, burger
//                    steak, dinuguan, t-bone, porter house — all served on
//                    a sizzling plate, all one flat price tier on the board).
//   Silog Meals  -> its own dedicated board, headed "SILOG MEALS" (every
//                    rice + egg + ulam combo — hotsilog, shanghaisilog,
//                    tapsilog, etc.). Named "Silog Meals" instead of just
//                    "Silog" to match the board's own wording exactly, so
//                    there's no ambiguity between the app's label and what's
//                    printed on the wall.
//   Soup         -> its own dedicated board, headed "SOUP MENU" (pares,
//                    mami, papaitan, pata, bulalo).
//   Side Order   -> the top half of the "SIDE ORDER / DRINKS" board (rice,
//                    lechon kawali, sisig variants, chicharon bulaklak,
//                    chicken wings) — food, sold as an add-on plate to any
//                    meal or on its own.
//   Drinks       -> the bottom half of that SAME board, kept as its OWN
//                    category rather than folded into Side Order: it's a
//                    visually separate section on the sign, and a different
//                    kind of item (beverages, not food) with its own dual
//                    small/large pricing — merging it with Side Order would
//                    hide that distinction from the customer.
//   Special Meal -> for every item that does NOT live under one of the
//                    boards above — Chicken Inasal, Kuy's Letchon Manok,
//                    Bicol Express, Spicy Adobong Peking Duck, the grilled
//                    fish/inihaw promo, Laing, steamed Kang Kong, and the
//                    Mr. Baka steak meals. On the shop's wall these are each
//                    their OWN standalone poster, never grouped under a
//                    shared header the way Lugaw or Sizzling are — so
//                    forcing them into an existing category would
//                    misrepresent the real menu board layout. "Special
//                    Meal" is the one bucket that honestly represents "the
//                    shop sells this, but it isn't part of a named section."
//   Add-Ons      -> NOT a section on any board — it's the shared picker the
//                    kiosk shows when a Lugaw or Silog item is tapped (egg,
//                    tokwa, tokwa't baboy, lomo, lechon, bulaklak, extra
//                    rice, etc.). Kept as ONE category, not one per parent
//                    item, because KioskMenu.tsx's add-on picker and
//                    categoryIcon.tsx's tab order both only ever look for a
//                    single "Add-Ons" category (see
//                    backfill-merge-addons-category.ts for the history of
//                    why that merge happened). Pinned last in the tab order
//                    since it's never a section a customer browses on its
//                    own — it only ever appears as a picker on top of
//                    something else.
//
// Order below matches src/components/order/categoryIcon.tsx's CATEGORY_ORDER
// (left-to-right, matching the boards' physical position at the counter) —
// keep the two in sync if you reorder one.
const productCategoryNames = [
  "Lugaw",
  "Sizzling",
  "Silog Meals",
  "Soup",
  "Side Order",
  "Drinks",
  "Special Meal",
  "Add-Ons",
];

// No Menu Items and no Inventory Items are seeded here on purpose — the
// owner is entering the real, current menu (names, prices, photos) and
// their real ingredient stock directly through Admin > Menu Items /
// Admin > Inventory Items, item by item. Auto-filling placeholder products
// here would just mean deleting or overwriting them by hand afterward.
// What IS seeded is everything that has to exist before that data-entry can
// even start: the category pick-lists above (so the "Category" dropdown on
// the Add Menu Item / Add Inventory Item form isn't empty), the standard
// units of measure, and the two logins needed to reach those screens at all.

async function main() {
  console.log("Seeding menu item categories...");
  for (const name of productCategoryNames) {
    await prisma.category.upsert({
      where: { name_type: { name, type: "PRODUCT" } },
      update: { active: true },
      create: { name, type: "PRODUCT" },
    });
  }
  console.log(`  -> ${productCategoryNames.length} categor${productCategoryNames.length === 1 ? "y" : "ies"}.`);

  // Ingredient categories aren't on the customer-facing menu at all (see
  // Category.type in schema.prisma) — start with just the schema's default
  // "Uncategorized" bucket and add real ones (Meats, Vegetables, Condiments…)
  // from Admin > Categories as Inventory Items are entered.
  await prisma.category.upsert({
    where: { name_type: { name: "Uncategorized", type: "INGREDIENT" } },
    update: { active: true },
    create: { name: "Uncategorized", type: "INGREDIENT" },
  });

  console.log("Seeding units of measure...");
  const units = [
    { name: "Kilogram", abbreviation: "KG" },
    { name: "Gram", abbreviation: "G" },
    { name: "Liter", abbreviation: "L" },
    { name: "Milliliter", abbreviation: "ML" },
    { name: "Piece", abbreviation: "PIECE" },
    { name: "Pack", abbreviation: "PACK" },
    { name: "Bulk", abbreviation: "BULK" },
  ];
  for (const u of units) {
    await prisma.unitOfMeasure.upsert({
      where: { abbreviation: u.abbreviation },
      update: {},
      create: u,
    });
  }

  console.log("Seeding staff accounts...");
  // No fixed default passwords. Each starting account gets a random one
  // (printed once below) unless you provide your own through SEED_ADMIN_PASSWORD /
  // SEED_STAFF_PASSWORD, and is flagged mustChangePassword so the first login
  // has to replace it. Accounts that already exist are left untouched.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || generateTempPassword();
  const staffPassword = process.env.SEED_STAFF_PASSWORD || generateTempPassword();
  const created: string[] = [];

  const existingStaff = await prisma.staff.findUnique({ where: { username: "staff" } });
  if (!existingStaff) {
    await prisma.staff.create({
      data: {
        name: "Counter Staff",
        username: "staff",
        passwordHash: await hashPassword(staffPassword),
        role: "STAFF",
        mustChangePassword: true,
      },
    });
    created.push(`  staff  /  ${staffPassword}   (counter)`);
  }

  const existingAdmin = await prisma.staff.findUnique({ where: { username: "admin" } });
  if (!existingAdmin) {
    await prisma.staff.create({
      data: {
        name: "Store Admin",
        username: "admin",
        passwordHash: await hashPassword(adminPassword),
        role: "ADMIN",
        mustChangePassword: true,
      },
    });
    created.push(`  admin  /  ${adminPassword}   (admin dashboard)`);
  }

  console.log("Seed complete — categories, units, and logins only, no sample menu items.");
  if (created.length > 0) {
    console.log("");
    console.log("New logins (shown once — you'll be asked to choose your own password at first login):");
    for (const line of created) console.log(line);
    console.log("");
  } else {
    console.log("The staff and admin accounts already exist, so their passwords were left as they are.");
    console.log("If they still use an old default, run: npm run auth -- force-change");
  }
  console.log("Next: Admin > Menu Items to add the real menu, and Admin > Inventory Items for real stock.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
