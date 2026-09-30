import "dotenv/config"; // load DATABASE_URL from .env when run through tsx
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Lugaw is raw rice cooked into a pot, not scooped per plate like a Silog
// side — but rather than measuring an exact pot yield, we apply the same
// "1 kg rice = 5 servings" rule already used for rice-as-a-side. That comes
// out to 0.2 kg of raw rice per bowl, which in the Rice ingredient's own
// cup unit (1 kg = 5 cups, see Ingredient.piecesPerUnit) is exactly 1 cup —
// same number as the existing Bangsilog/Hotsilog/Tapsilog recipes.
const LUGAW_ITEMS = ["Arozzcaldo", "Goto", "Lomo"];
const RICE_QTY_CUPS = 1;

async function main() {
  const rice = await prisma.ingredient.findFirst({ where: { name: "Rice" } });
  if (!rice) {
    throw new Error('No Ingredient named "Rice" found — check Admin > Ingredients for the exact name.');
  }

  for (const name of LUGAW_ITEMS) {
    const product = await prisma.product.findFirst({ where: { name } });
    if (!product) {
      console.log(`  ! Skipped "${name}" — no matching Menu Item found.`);
      continue;
    }

    await prisma.recipeItem.upsert({
      where: { productId_ingredientId: { productId: product.id, ingredientId: rice.id } },
      update: { qty: RICE_QTY_CUPS },
      create: { productId: product.id, ingredientId: rice.id, qty: RICE_QTY_CUPS },
    });
    console.log(`  -> ${name}: Rice = ${RICE_QTY_CUPS} cup`);
  }

  console.log("Done — check Admin > Recipes to confirm.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
