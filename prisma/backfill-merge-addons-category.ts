import "dotenv/config"; // load DATABASE_URL from .env when run through tsx
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// This app only ever expects ONE Add-Ons category — the kiosk's add-on
// picker (KioskMenu.tsx) and the category tab order (categoryIcon.tsx)
// both look for a single "Add-Ons" category shared across every parent
// item. Older data/seeds split this into two ("Lugaw Add-ons" and "Silog
// Add-ons"), which is the bug this script fixes for an existing database
// (a fresh `npm run seed` already seeds it correctly and doesn't need
// this). Safe to run more than once — every step below is a no-op if
// there's nothing left to merge.
const SURVIVING_NAME = "Add-Ons";
const OLD_NAMES = ["Lugaw Add-ons", "Silog Add-ons", "Add-ons"];

async function main() {
  console.log(`Merging legacy add-on categories into "${SURVIVING_NAME}"...`);

  // 1. Move every Menu Item off the old category names and onto the
  //    surviving one. Product.category is a plain string, not a foreign
  //    key, so this is just a bulk string update.
  for (const oldName of OLD_NAMES) {
    if (oldName === SURVIVING_NAME) continue;
    const { count } = await prisma.product.updateMany({
      where: { category: oldName },
      data: { category: SURVIVING_NAME },
    });
    if (count > 0) console.log(`  -> moved ${count} item(s) out of "${oldName}"`);
  }

  // 2. Make sure the surviving Category row exists (Admin > Categories'
  //    picklist), then delete the old Category rows now that nothing
  //    references them anymore.
  await prisma.category.upsert({
    where: { name_type: { name: SURVIVING_NAME, type: "PRODUCT" } },
    update: { active: true },
    create: { name: SURVIVING_NAME, type: "PRODUCT" },
  });

  for (const oldName of OLD_NAMES) {
    if (oldName === SURVIVING_NAME) continue;
    const { count } = await prisma.category.deleteMany({
      where: { name: oldName, type: "PRODUCT" },
    });
    if (count > 0) console.log(`  -> removed the old "${oldName}" category`);
  }

  const remaining = await prisma.product.findMany({
    where: { category: SURVIVING_NAME },
    select: { name: true },
  });
  console.log(`Done — "${SURVIVING_NAME}" now has ${remaining.length} item(s):`);
  remaining.forEach((p) => console.log(`   - ${p.name}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
