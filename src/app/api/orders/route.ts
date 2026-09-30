import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { HttpError, readJson, toErrorResponse } from "@/lib/api-helpers";
import { clientIp } from "@/lib/auth-throttle";
import { rateLimited } from "@/lib/rate-limit";
import { expireStaleOrders } from "@/lib/services/orderCancel";
import { notify } from "@/lib/pusher";
import { generateOrderCodeDataUri, generateBarcodeDataUri } from "@/lib/services/codes";
import { printKioskCashPendingTicket, printKioskGcashPendingTicket } from "@/lib/services/printer";
import { createOrderSchema } from "@/lib/validations";
import { hasEnough } from "@/lib/services/availability";
import { fromCentavos, lineCentavos } from "@/lib/money";
import { newCancelToken } from "@/lib/orderCancelToken";

function padOrderNo(id: number) {
  return String(id).padStart(4, "0");
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
const orderInclude = { items: { include: { product: true, comboMeal: true } } } as const;

/** Builds the 201/200 response for a saved order (barcode/QR images are best-effort). */
async function orderResponse(
  order: { barcode: string; cancelTokenHash?: string | null },
  source: string,
  status: number,
  headers?: Record<string, string>,
  cancelToken?: string
) {
  // The stored hash never leaves the server.
  const { cancelTokenHash: _hash, ...publicOrder } = order;
  void _hash;
  // Linear Code39 barcode: the kiosk/counter ticket's scannable identifier.
  const barcodeImage = await generateBarcodeDataUri(order.barcode).catch(() => null);
  // QR code: only for the GCash digital receipt on the QR (phone) flow.
  const qrImage = source === "QR" ? await generateOrderCodeDataUri(order.barcode).catch(() => null) : null;
  // cancelToken is only present on the response that created the order (a
  // replay of an Idempotency-Key can't return it: only its hash is stored).
  return NextResponse.json({ order: publicOrder, barcodeImage, qrImage, cancelToken: cancelToken ?? null }, { status, headers });
}

// POST /api/orders
// Optional header `Idempotency-Key: <8-100 chars of A-Z a-z 0-9 _ ->`: a retry
// with the same key returns the order the first attempt created (200 plus
// `Idempotent-Replay: true`) instead of creating a duplicate.
// body: { type, source, paymentMethod, notes, items: [{ productId | comboMealId, qty, notes }] }
// `notes` at the top level is a note for the whole order (e.g. "no bago,
// extra sauce"); the per-item `notes` is reserved for a note tied to a
// single line item. Each line is either a regular Menu Item (productId)
// or a Combo Meal bundle (comboMealId) — see orderItemSchema.
export async function POST(req: NextRequest) {
  const parsed = createOrderSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { type, source, paymentMethod, notes, items } = parsed.data;

  // `source` is chosen by the caller, so "COUNTER" (the staff walk-in flow)
  // must be backed by a real staff/admin session. KIOSK and QR stay public
  // (the kiosk and customers' phones have no login) but are rate-limited per
  // address so a script can't reserve all the stock with junk orders. The
  // limit is per IP and a store's Wi-Fi is one IP, so it is set well above
  // what real customers place: 30 orders / 10 min.
  if (source === "COUNTER") {
    const session = await requireRole(["STAFF", "ADMIN"]);
    if (!session) return NextResponse.json({ error: "Please sign in as staff to enter counter orders." }, { status: 401 });
  }

  const rawKey = req.headers.get("idempotency-key");
  let idempotencyKey: string | null = null;
  if (rawKey !== null) {
    if (!IDEMPOTENCY_KEY_RE.test(rawKey)) {
      return NextResponse.json({ error: "Invalid Idempotency-Key" }, { status: 400 });
    }
    idempotencyKey = rawKey;
    // A retry of an order that was already saved: hand back that order. This
    // runs before the rate limit so a retry can never be refused.
    try {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: orderInclude });
      if (existing) return orderResponse(existing, existing.source, 200, { "Idempotent-Replay": "true" });
    } catch (err) {
      return toErrorResponse(err);
    }
  }

  if (
    source !== "COUNTER" &&
    (await rateLimited({ kind: "ORDER", subject: "create", ip: clientIp(req.headers), windowMs: 10 * 60 * 1000, perIp: 30 }))
  ) {
    return NextResponse.json({ error: "Too many orders from this device. Please wait a few minutes." }, { status: 429 });
  }

  // Unpaid orders older than 30 min give their reserved ingredients back
  // before this one tries to reserve them. Best-effort; never blocks the order.
  await expireStaleOrders().catch((e) => console.error("expireStaleOrders failed:", e));

  const cancel = newCancelToken();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const productIds = items.filter((i) => i.productId).map((i) => i.productId!);
        const comboMealIds = items.filter((i) => i.comboMealId).map((i) => i.comboMealId!);

        // Pull each Menu Item's Recipe along with it — every Menu Item is
        // recipe-driven now, so availability + deduction always come from
        // the linked Ingredients. No recipe yet -> not sellable.
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          include: { recipeItems: { include: { ingredient: true } } },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        // A combo isn't a Product itself — it's priced as a bundle, but
        // still deducts stock from each of its underlying items' recipes,
        // one recipe-walk per component, the same way a regular sale does.
        const combos = await tx.comboMeal.findMany({
          where: { id: { in: comboMealIds } },
          include: {
            items: {
              include: { product: { include: { recipeItems: { include: { ingredient: true } } } } },
            },
          },
        });
        const comboMap = new Map(combos.map((c) => [c.id, c]));

        // Every Ingredient this order will draw from, aggregated across
        // ALL lines first (a regular item and a combo can easily share an
        // ingredient, e.g. both include Rice) — checked once against the
        // total needed instead of once per line. Checking per-line against
        // the same starting stock number would wrongly allow two lines
        // that each fit alone but not together.
        const neededByIngredient = new Map<
          number,
          { needed: number; ingredient: (typeof products)[number]["recipeItems"][number]["ingredient"] }
        >();

        function addNeeded(ingredientId: number, ingredient: (typeof products)[number]["recipeItems"][number]["ingredient"], qty: number) {
          const cur = neededByIngredient.get(ingredientId);
          if (cur) {
            cur.needed += qty;
          } else {
            neededByIngredient.set(ingredientId, { needed: qty, ingredient });
          }
        }

        // Money is added up in whole centavos and divided once at the end:
        // 0.1 x 3 = 0.30000000000000004 in floating point, and an unrounded
        // total made exact cash get rejected at the counter.
        let totalCentavos = 0;
        for (const item of items) {
          if (item.productId) {
            const product = productMap.get(item.productId);
            if (!product || !product.active) {
              throw new HttpError(409, "An item in your order is no longer available");
            }
            if (product.recipeItems.length === 0) {
              // Doesn't have a Recipe set up yet — don't sell it off the
              // old, unmanaged legacy stock number.
              throw new HttpError(409, `${product.name} is not available right now`);
            }
            for (const recipe of product.recipeItems) {
              addNeeded(recipe.ingredientId, recipe.ingredient, recipe.qty * item.qty);
            }
            totalCentavos += lineCentavos(product.price, item.qty);
          } else {
            const combo = comboMap.get(item.comboMealId!);
            if (!combo || !combo.active) {
              throw new HttpError(409, "A combo in your order is no longer available");
            }
            for (const comboItem of combo.items) {
              const product = comboItem.product;
              if (!product.active) {
                throw new HttpError(409, `${product.name} (in ${combo.name}) is not available`);
              }
              if (product.recipeItems.length === 0) {
                throw new HttpError(409, `${product.name} (in ${combo.name}) is not available right now`);
              }
              for (const recipe of product.recipeItems) {
                addNeeded(recipe.ingredientId, recipe.ingredient, recipe.qty * comboItem.qty * item.qty);
              }
            }
            totalCentavos += lineCentavos(combo.price, item.qty);
          }
        }

        const total = fromCentavos(totalCentavos);

        // Lock every Ingredient row this order will draw from for the rest
        // of this transaction, then re-read stock fresh under that lock.
        // Before this fix, availability was checked against the plain
        // `tx.product.findMany`/`tx.comboMeal.findMany` reads above, which
        // don't hold a row lock — under Postgres's default Read Committed
        // isolation, two concurrent orders for the last unit of the same
        // ingredient could both read "stock is enough" before either had
        // committed its decrement, and both would pass. With only one
        // physical kiosk this was a narrow window, but the QR-ordering
        // pages mean many customers can hit this endpoint at the same
        // moment, so the race is realistic, not theoretical.
        // `SELECT ... FOR UPDATE` makes the second transaction block on
        // this ingredient's row until the first one commits (and its
        // decrement becomes visible), instead of the second one deciding
        // stock is fine based on a snapshot the first is about to change.
        // ORDER BY "id": two concurrent orders with overlapping ingredients
        // must take their row locks in the same order or they can deadlock.
        // `active` and `trackByPiece` are read under the lock too, so the
        // check and the decrement below use the same fresh values.
        const ingredientIds = Array.from(neededByIngredient.keys()).sort((x, y) => x - y);
        const lockedStock =
          ingredientIds.length > 0
            ? await tx.$queryRaw<
                { id: number; stock: number; pieceStock: number; trackByPiece: boolean; active: boolean }[]
              >`
                SELECT "id", "stock", "pieceStock", "trackByPiece", "active" FROM "Ingredient"
                WHERE "id" IN (${Prisma.join(ingredientIds)}) ORDER BY "id" FOR UPDATE
              `
            : [];
        const lockedById = new Map(lockedStock.map((r) => [r.id, r]));

        for (const [ingredientId, { needed, ingredient }] of neededByIngredient) {
          const fresh = lockedById.get(ingredientId);
          if (!fresh || !fresh.active) {
            throw new HttpError(409, `${ingredient.name} is not available right now`);
          }
          const available = fresh.trackByPiece ? fresh.pieceStock : fresh.stock;
          // Tolerance for float noise (0.1 * 3 > 0.3).
          if (!hasEnough(available, needed)) {
            throw new HttpError(409, `Insufficient stock of ${ingredient.name}`);
          }
        }

        // Create order with a temporary unique orderNo/barcode, then rename using its id.
        const tempTag = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const order = await tx.order.create({
          data: {
            orderNo: tempTag,
            barcode: tempTag,
            type,
            source,
            paymentMethod,
            total,
            idempotencyKey,
            cancelTokenHash: cancel.hash,
            notes: notes || null,
            items: {
              create: items.map((i) => {
                if (i.productId) {
                  return {
                    productId: i.productId,
                    qty: i.qty,
                    notes: i.notes || null,
                    unitPrice: productMap.get(i.productId)!.price,
                  };
                }
                const combo = comboMap.get(i.comboMealId!)!;
                // Freeze what the combo contained at the moment of sale —
                // editing or deleting the ComboMeal later must never rewrite
                // what an already-printed kitchen ticket/receipt showed.
                const snapshot = combo.items.map((ci) => ({ name: ci.product.name, qty: ci.qty }));
                return {
                  comboMealId: i.comboMealId,
                  qty: i.qty,
                  notes: i.notes || null,
                  unitPrice: combo.price,
                  comboItemsSnapshot: snapshot,
                };
              }),
            },
          },
        });

        const orderNo = padOrderNo(order.id);
        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: { orderNo, barcode: `ORD-${orderNo}` },
          include: orderInclude,
        });

        // The pending GCash Payment row is created in the SAME transaction as
        // the order, so a GCash order can never exist without one (it used to
        // be a separate write after commit).
        if (paymentMethod === "GCASH") {
          await tx.payment.create({
            data: { orderId: order.id, method: "GCASH", status: "pending" },
          });
        }

        // Stock decrements + inventory logs are independent of each other,
        // so run them concurrently instead of one-by-one — this keeps the
        // transaction short-lived, which matters because Neon (and most
        // pooled Postgres setups) will fail interactive transactions that
        // hold a connection too long ("Unable to start a transaction in
        // the given time" is Prisma's maxWait error when the pool can't
        // hand out a free connection in time).
        //
        // Deducts from the SAME aggregated total computed above, so a
        // shared ingredient between a solo item and a combo is only ever
        // decremented once for its combined usage, not twice.
        await Promise.all(
          Array.from(neededByIngredient.entries()).flatMap(([ingredientId, { needed }]) => {
            const pool = lockedById.get(ingredientId)!.trackByPiece ? "pieceStock" : "stock";
            return [
              tx.ingredient.update({
                where: { id: ingredientId },
                data: { [pool]: { decrement: needed } },
              }),
              // orderId lets a cancel reverse exactly what was sold here.
              tx.ingredientLog.create({
                data: { ingredientId, change: -needed, reason: "SALE", target: pool, note: `Order #${orderNo}`, orderId: order.id },
              }),
            ];
          })
        );

        return updatedOrder;
      },
      // Give the transaction more room than Prisma's defaults (2s to grab a
      // connection, 5s to finish) — those are too tight for a hosted/pooled
      // Postgres instance (e.g. Neon) under any real latency or concurrent
      // load, and were the direct cause of the timeout error above.
      { maxWait: 10000, timeout: 20000 }
    );

    // The order and its stock deduction are committed. Everything from here
    // on is best-effort: a printer, barcode or Pusher hiccup must never turn
    // a saved order into an error, or the customer retries and creates a
    // duplicate. (The pending GCash Payment row was created inside the
    // transaction above.)
    //
    // Kiosk/counter orders log a "NOT YET PAID" ticket here (the real print
    // happens client-side, see OrderFlow.tsx); the order stays CREATED, not
    // sent to the kitchen, until staff confirm payment in the queue. The
    // staff screen also needs telling that a new order exists.
    await Promise.allSettled([
      source === "KIOSK" || source === "COUNTER"
        ? paymentMethod === "GCASH"
          ? printKioskGcashPendingTicket(result)
          : printKioskCashPendingTicket(result)
        : null,
      notify("staff:queue-updated", {}),
    ]);

    return orderResponse(result, source, 201, undefined, cancel.token);
  } catch (err) {
    // Two requests with the same Idempotency-Key raced: the loser's
    // transaction rolled back (stock untouched), so return the winner's order.
    if (
      idempotencyKey &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      String(err.meta?.target ?? "").includes("idempotencyKey")
    ) {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: orderInclude });
      if (existing) return orderResponse(existing, existing.source, 200, { "Idempotent-Replay": "true" });
    }
    return toErrorResponse(err);
  }
}
