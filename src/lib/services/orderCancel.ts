import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api-helpers";
import { notify } from "@/lib/pusher";
import { logAudit } from "@/lib/services/audit";

/** Unpaid (CREATED) orders older than this are cancelled and their stock returned. */
export const ORDER_EXPIRY_MS = 30 * 60 * 1000;

/**
 * Cancels an order and gives back the ingredient stock it reserved. Shared by
 * the staff Cancel button (any status except COMPLETED/CANCELLED) and the
 * expiry job (`onlyIfStatus: "CREATED"` so it can never cancel an order that
 * was paid a moment ago). Throws HttpError for "not found" / "already done".
 */
export async function cancelOrder(
  orderId: number,
  opts: { onlyIfStatus?: OrderStatus; actor?: { id?: number; name: string } } = {}
) {
  const { order, refundDue } = await cancelOrderTx(orderId, opts);
  // Audit trail: who cancelled what. Written after the commit and never
  // blocks it (logAudit swallows its own errors). The expiry job has no actor
  // and only ever touches unpaid orders, so it is not logged here.
  if (opts.actor) {
    await logAudit({
      action: "order.cancel",
      entityType: "Order",
      entityId: order.id,
      description: `Cancelled order #${order.orderNo} (${order.status}, ₱${order.total.toFixed(2)})${
        refundDue ? " — payment was already taken, refund due" : ""
      }`,
      actorName: opts.actor.name,
      actorId: opts.actor.id,
    });
  }
  return order;
}

async function cancelOrderTx(orderId: number, opts: { onlyIfStatus?: OrderStatus }) {
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: { include: { recipeItems: true } },
              comboMeal: { include: { items: { include: { product: { include: { recipeItems: true } } } } } },
            },
          },
        },
      });
      if (!order) throw new HttpError(404, "Order not found");
      if (order.status === "COMPLETED" || order.status === "CANCELLED") {
        throw new HttpError(409, `Order is already ${order.status.toLowerCase()}`);
      }
      if (opts.onlyIfStatus && order.status !== opts.onlyIfStatus) {
        throw new HttpError(409, `Order is ${order.status.toLowerCase()}, not ${opts.onlyIfStatus.toLowerCase()}`);
      }

      // Same atomic-guard pattern as markOrderPaid: scope the UPDATE to the
      // status we just read so a concurrent cancel (or a payment confirmation
      // racing against this) can't double-process.
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: { status: "CANCELLED" },
      });
      if (count === 0) throw new HttpError(409, "Order status changed — please refresh and try again");

      // Give back exactly what the sale took out. POST /api/orders logs one
      // SALE row per ingredient (with orderId) for the amounts it really
      // deducted, so reversing those stays correct even if a recipe or a
      // combo's contents were edited after the sale. Orders placed before
      // IngredientLog.orderId existed are matched by their "Order #…" note;
      // if neither finds anything, fall back to the current recipe.
      type Return = { ingredientId: number; target: string; qty: number };
      const returns = new Map<string, Return>();
      const addReturn = (ingredientId: number, target: string, qty: number) => {
        const key = `${ingredientId}:${target}`;
        const cur = returns.get(key);
        if (cur) cur.qty += qty;
        else returns.set(key, { ingredientId, target, qty });
      };

      let sales = await tx.ingredientLog.findMany({ where: { orderId, reason: "SALE" } });
      if (sales.length === 0 && order.orderNo) {
        sales = await tx.ingredientLog.findMany({
          where: { orderId: null, reason: "SALE", note: `Order #${order.orderNo}` },
        });
      }
      for (const sale of sales) addReturn(sale.ingredientId, sale.target, -sale.change);

      if (returns.size === 0) {
        // Legacy fallback: re-derive from the current recipe.
        const needed = new Map<number, number>();
        const add = (id: number, qty: number) => needed.set(id, (needed.get(id) ?? 0) + qty);
        for (const item of order.items) {
          if (item.product) {
            for (const r of item.product.recipeItems) add(r.ingredientId, r.qty * item.qty);
          } else if (item.comboMeal) {
            for (const ci of item.comboMeal.items) {
              for (const r of ci.product.recipeItems) add(r.ingredientId, r.qty * ci.qty * item.qty);
            }
          }
        }
        if (needed.size > 0) {
          const ingredients = await tx.ingredient.findMany({
            where: { id: { in: Array.from(needed.keys()) } },
            select: { id: true, trackByPiece: true },
          });
          const byPiece = new Map(ingredients.map((i) => [i.id, i.trackByPiece]));
          for (const [id, qty] of needed) addReturn(id, byPiece.get(id) ? "pieceStock" : "stock", qty);
        }
      }

      // Increments are done inside the database (never read-modify-write), so
      // a sale happening at the same moment isn't overwritten.
      await Promise.all(
        Array.from(returns.values()).flatMap(({ ingredientId, target, qty }) => [
          tx.ingredient.update({ where: { id: ingredientId }, data: { [target]: { increment: qty } } }),
          // Reuses ADJUSTMENT (no new enum value / migration); orderId + note
          // tell it apart from a manual correction.
          tx.ingredientLog.create({
            data: {
              ingredientId,
              change: qty,
              reason: "ADJUSTMENT",
              target,
              note: `Returned — order #${order.orderNo ?? order.id} cancelled`,
              orderId,
            },
          }),
        ])
      );

      // Money already taken for this order now has to be handed back. Flag the
      // payment so it shows up as owed instead of staying "paid" forever.
      let refundDue = false;
      if (order.status === "PAID" || order.status === "READY") {
        const { count: flagged } = await tx.payment.updateMany({
          where: { orderId, status: "paid" },
          data: { status: "refund_due" },
        });
        refundDue = flagged > 0;
      }

      return { order, refundDue };
    },
    // Same generous timeouts as order creation (see POST /api/orders):
    // Prisma's 2s/5s defaults are too tight for a hosted/pooled Postgres.
    { maxWait: 10000, timeout: 20000 }
  );
}

/**
 * Cancels unpaid orders that have been sitting longer than ORDER_EXPIRY_MS so
 * abandoned kiosk/QR orders stop holding ingredients. Best-effort and safe to
 * call often: one indexed query when there is nothing to do. Called from the
 * cron route, when a new order comes in, and when staff load the queue.
 */
export async function expireStaleOrders(limit = 25): Promise<number> {
  const cutoff = new Date(Date.now() - ORDER_EXPIRY_MS);
  const stale = await prisma.order.findMany({
    where: { status: "CREATED", createdAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let cancelled = 0;
  for (const { id } of stale) {
    try {
      await cancelOrder(id, { onlyIfStatus: "CREATED" });
      cancelled++;
    } catch (err) {
      // 409 = someone paid/cancelled it first; nothing to do.
      if (!(err instanceof HttpError)) console.error("expireStaleOrders:", err);
    }
  }
  if (cancelled > 0) {
    await notify("staff:queue-updated", {});
    await notify("menu:updated", {});
  }
  return cancelled;
}
