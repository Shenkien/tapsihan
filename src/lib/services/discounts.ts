import { prisma } from "@/lib/prisma";
import { lineCentavos, roundPeso, fromCentavos } from "@/lib/money";

// Starting list, created once the first time anyone asks for discounts so the
// counter works straight away. After that the admin owns the list — edit the
// percentages, add PWD, turn one off — and nothing here ever overwrites it.
const DEFAULTS = [
  { name: "Senior Citizen", percent: 20 },
  { name: "Student", percent: 10 },
];
const SEEDED_KEY = "discounts.seeded";

export async function ensureDefaultDiscounts() {
  const done = await prisma.setting.findUnique({ where: { key: SEEDED_KEY } });
  if (done) return;
  await prisma.discount.createMany({ data: DEFAULTS, skipDuplicates: true });
  await prisma.setting.upsert({
    where: { key: SEEDED_KEY },
    update: { value: "1" },
    create: { key: SEEDED_KEY, value: "1" },
  });
}

/** Discount amount and what's left to pay, rounded to centavos. */
export function computeDiscount(subtotal: number, percent: number) {
  const discountAmount = roundPeso((subtotal * percent) / 100);
  return { discountAmount, total: roundPeso(subtotal - discountAmount) };
}

/** Pre-discount amount of an order, from its lines. */
export function orderSubtotal(items: { qty: number; unitPrice: number }[]) {
  return fromCentavos(items.reduce((sum, i) => sum + lineCentavos(i.unitPrice, i.qty), 0));
}
