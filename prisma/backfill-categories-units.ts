import "dotenv/config"; // load DATABASE_URL from .env when run through tsx
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Friendly full names for the old hard-coded enum values, so they don't
// show up in Unit of Measure Maintenance as just "KG" with no name. Any
// unit found on an Ingredient that ISN'T in this list falls back to using
// its own value as both name and abbreviation — still gets seeded, just
// without a nicer name until you edit it in Maintenance.
const UNIT_NAMES: Record<string, string> = {
  PIECE: "Piece",
  KG: "Kilogram",
  G: "Gram",
  L: "Liter",
  ML: "Milliliter",
  PACK: "Pack",
  BULK: "Bulk",
};

async function main() {
  console.log("Backfilling Units of Measure from existing Ingredient.unit values...");
  const ingredientUnits = await prisma.ingredient.findMany({
    select: { unit: true },
    distinct: ["unit"],
  });
  for (const { unit } of ingredientUnits) {
    await prisma.unitOfMeasure.upsert({
      where: { abbreviation: unit },
      update: {},
      create: { abbreviation: unit, name: UNIT_NAMES[unit] ?? unit },
    });
  }
  console.log(`  -> ${ingredientUnits.length} unit(s).`);

  console.log("Backfilling Ingredient categories...");
  const ingredientCategories = await prisma.ingredient.findMany({
    select: { category: true },
    distinct: ["category"],
  });
  for (const { category } of ingredientCategories) {
    await prisma.category.upsert({
      where: { name_type: { name: category, type: "INGREDIENT" } },
      update: {},
      create: { name: category, type: "INGREDIENT" },
    });
  }
  console.log(`  -> ${ingredientCategories.length} category(ies).`);

  console.log("Backfilling Menu Item categories...");
  const productCategories = await prisma.product.findMany({
    select: { category: true },
    distinct: ["category"],
  });
  for (const { category } of productCategories) {
    await prisma.category.upsert({
      where: { name_type: { name: category, type: "PRODUCT" } },
      update: {},
      create: { name: category, type: "PRODUCT" },
    });
  }
  console.log(`  -> ${productCategories.length} category(ies).`);

  console.log("Backfill complete — check Admin > Categories and Admin > Units.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
