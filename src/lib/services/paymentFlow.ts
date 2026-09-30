import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/services/audit";
import { fromCentavos, toCentavos } from "@/lib/money";
import {
  printCounterReceipt,
  printKioskTicket,
  printKitchenTicket,
} from "@/lib/services/printer";
import { notify } from "@/lib/pusher";

type PaidOptions = {
  method: "CASH" | "GCASH";
  /** Staff who took the payment. Omitted only for the dev simulate route. */
  actorId?: number;
  actorName: string;
  /** Pesos actually received (cash handed over / GCash amount sent). */
  amountReceived: number;
  /** Real GCash reference number (GCash only). */
  gcashRef?: string;
};

/**
 * The one place an order becomes PAID. Used by confirm-cash, confirm-gcash and
 * the dev simulate route, so every payment goes through the same checks:
 *
 *   - the order must be a `method` order and still CREATED
 *   - the amount received must cover the total (compared in centavos, so
 *     0.1 * 3 style float noise can't reject exact cash)
 *   - the status flip, the total and the Payment row are written in ONE
 *     transaction: the flip is pinned to the total staff saw (a discount
 *     applied in between makes it fail with 409 instead of confirming a stale
 *     amount), and the Payment row is guaranteed to exist
 *   - a GCash reference number can only ever be used once
 *   - who confirmed it is stored on the Payment and written to the Audit Log
 *
 * Prints and realtime events run AFTER the payment is saved and are
 * best-effort: a printer or Pusher hiccup can no longer turn a saved payment
 * into an error that makes staff retry into "already confirmed".
 */
export async function markOrderPaid(orderNo: string, opts: PaidOptions) {
  const order = await prisma.order.findUnique({
    where: { orderNo },
    select: { id: true, orderNo: true, status: true, paymentMethod: true, total: true },
  });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.paymentMethod !== opts.method) {
    throw new HttpError(400, `This is not a ${opts.method === "CASH" ? "cash" : "GCash"} order`);
  }
  if (order.status !== "CREATED") throw new HttpError(409, `Order already ${order.status}`);

  const totalC = toCentavos(order.total);
  const recvC = toCentavos(opts.amountReceived);
  if (recvC < totalC) throw new HttpError(400, "Amount received is less than the total");
  // Cash: change to hand back. GCash: an overpayment the store needs to refund.
  const change = fromCentavos(recvC - totalC);

  const paidAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: { id: order.id, status: "CREATED", total: order.total },
        data: { status: "PAID", paidAt },
      });
      if (claim.count === 0) {
        throw new HttpError(409, "This order just changed — please reopen it and try again");
      }
      const data = {
        status: "paid",
        paidAt,
        amountReceived: opts.amountReceived,
        change,
        gcashRef: opts.gcashRef ?? null,
        confirmedById: opts.actorId ?? null,
      };
      await tx.payment.upsert({
        where: { orderId: order.id },
        update: data,
        create: { orderId: order.id, method: opts.method, ...data },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const t = e.meta?.target;
      const target = Array.isArray(t) ? t.join(",") : String(t ?? "");
      if (target.includes("gcashRef")) {
        throw new HttpError(409, "That GCash reference number was already used on another order.");
      }
    }
    throw e;
  }

  await logAudit({
    action: opts.method === "CASH" ? "order.confirm_cash" : "order.confirm_gcash",
    entityType: "Order",
    entityId: order.id,
    description:
      `Confirmed ${opts.method} for #${order.orderNo}: total ₱${order.total.toFixed(2)}, ` +
      `received ₱${opts.amountReceived.toFixed(2)}` +
      (change > 0 ? `, ${opts.method === "CASH" ? "change" : "overpaid"} ₱${change.toFixed(2)}` : "") +
      (opts.gcashRef ? `, GCash ref ${opts.gcashRef}` : ""),
    actorName: opts.actorName,
    actorId: opts.actorId,
  });

  const updated = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: { include: { product: true, comboMeal: true } }, payment: true },
  });

  const fromCounterOrKiosk = updated.source === "KIOSK" || updated.source === "COUNTER";
  await Promise.allSettled([
    // Mock/log copies only — kept for the /api/dev/print-log preview.
    printKitchenTicket(updated),
    opts.method === "CASH" && updated.payment
      ? printCounterReceipt(updated, updated.payment)
      : fromCounterOrKiosk
        ? printKioskTicket(updated)
        : null,
    // Lets a QR customer's digital receipt flip to "Paid" live.
    notify("order:paid", { orderNo: updated.orderNo, status: updated.status }),
    notify("staff:queue-updated", {}),
    // The REAL kitchen ticket, on the kitchen printer bridge. Fires the
    // instant payment is confirmed; there is no separate "send to kitchen".
    notify("kitchen-ticket:print-requested", { orderNo: updated.orderNo }),
    // The customer's paid receipt on the counter printer bridge. Whoever
    // confirms payment is on a different device from the kiosk that showed
    // the order, so the bridge is asked to print it. QR orders skip this —
    // their phone already shows the live digital receipt.
    fromCounterOrKiosk
      ? notify("receipt:print-requested", { orderNo: updated.orderNo, variant: "paid" })
      : null,
  ]);

  return updated;
}
