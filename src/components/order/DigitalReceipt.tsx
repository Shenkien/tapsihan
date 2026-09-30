"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import TornEdge from "@/components/order/TornEdge";
import { orderItemName, orderItemComboContents, type OrderRecord } from "@/types/models";
import { downloadDigitalReceiptImage } from "@/lib/downloadDigitalReceiptImage";

// Same maroon-and-gold, torn-paper-banner treatment as the kiosk's
// PaymentStep confirmation card, so a QR/phone order feels like the same
// brand as the in-store kiosk instead of a plainer, unbranded screen.
//
// No validating QR here — staff confirm a cash order off the order number
// alone (tap it in the "Awaiting Payment" list at the counter), so there's
// nothing for the customer's phone to display for that.
export default function DigitalReceipt({
  order,
  paid,
  cancelled = false,
}: {
  order: OrderRecord;
  paid: boolean;
  /** True once staff cancel the order — must be checked ahead of `paid`
   *  wherever both are used, since a cancelled order is never "paid". */
  cancelled?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const isCash = order.paymentMethod === "CASH";

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadDigitalReceiptImage(order, { paid, cancelled });
    } finally {
      setDownloading(false);
    }
  }

  const subtitle = cancelled
    ? "This order was cancelled — please see staff."
    : paid
      ? isCash
        ? "Paid — cash confirmed."
        : "Payment received — we'll call your number."
      : "Your order has been placed.";

  return (
    <div className="animate-fade-up mx-auto w-full max-w-[380px] overflow-hidden rounded-3xl bg-white shadow-brand">
      {/* Banner — identical structure to the kiosk's ThankYouBanner. */}
      <div
        className={`relative overflow-hidden rounded-t-3xl pb-9 pt-7 text-center text-rice-50 ${
          cancelled ? "bg-charcoal-900" : "bg-leaf-900"
        }`}
      >
        <span className="absolute left-6 top-5 h-2 w-2 rounded-full bg-turmeric-500/70" aria-hidden />
        <span className="absolute right-8 top-9 h-1.5 w-1.5 rounded-full bg-rice-50/50" aria-hidden />
        <span className="absolute left-12 bottom-8 h-1.5 w-1.5 rounded-full bg-rice-50/40" aria-hidden />
        <span className="absolute right-6 bottom-10 h-2 w-2 rounded-full bg-turmeric-500/60" aria-hidden />

        <span
          className={`relative mx-auto flex h-16 w-16 items-center sm:h-20 sm:w-20 justify-center rounded-full shadow-brand ring-4 ring-white/15 ${
            cancelled ? "bg-rice-50" : "bg-turmeric-500"
          }`}
        >
          {cancelled ? (
            <XCircle size={42} className="text-charcoal-900" />
          ) : (
            <CheckCircle2 size={42} className="text-leaf-900" />
          )}
        </span>
        <h2 className="relative mt-4 font-display text-2xl font-extrabold">
          {cancelled ? "Order cancelled" : paid ? "Thank you!" : "Order placed!"}
        </h2>
        <p className="relative px-6 text-sm text-rice-50/80 sm:text-base">{subtitle}</p>

        <TornEdge color="text-white" />
      </div>

      <div className="flex flex-col items-center gap-4 p-4 sm:gap-5 sm:p-6">
        <div className="w-full rounded-2xl border-2 border-turmeric-500 bg-turmeric-500/20 px-4 py-4 text-center shadow-brand sm:px-6 sm:py-5">
          <p className="text-xs font-bold uppercase tracking-widest text-charcoal-900/60">Your order number</p>
          <p className="big-number break-all text-5xl text-achuete-600 sm:text-6xl">#{order.orderNo}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-charcoal-900/50">
            {order.type === "DINE_IN" ? "Dine-in" : "Takeout"}
          </p>
        </div>

        {/* Receipt meta — when it was placed and how it's being paid, so the
            screenshot/download stands on its own as a receipt. */}
        <div className="flex w-full items-center justify-between gap-3 text-xs font-semibold text-charcoal-900/60">
          <span>
            {new Date(order.createdAt).toLocaleString("en-PH", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <span className="rounded-full bg-charcoal-900/5 px-2.5 py-1 font-extrabold uppercase tracking-wide">
            {isCash ? "Cash" : "GCash"}
          </span>
        </div>

        <div className="w-full rounded-2xl border border-border bg-white p-4 text-left shadow-sm sm:p-5">
          <div className="flex flex-col gap-1.5">
            {order.items.map((item) => {
              const combo = orderItemComboContents(item);
              return (
                <div key={item.id} className="flex flex-col gap-0.5">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words">
                      {item.qty}x {orderItemName(item)}
                    </span>
                    <span className="whitespace-nowrap font-semibold">
                      ₱{(item.unitPrice * item.qty).toFixed(0)}
                    </span>
                  </div>
                  {combo && combo.length > 0 && (
                    <div className="pl-4 text-xs text-charcoal-900/50">
                      {combo.map((ci, i) => (
                        <div key={i}>
                          {ci.qty}x {ci.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {order.notes && (
            <>
              <Separator className="my-3" />
              <p className="text-sm">
                <span className="font-extrabold uppercase tracking-widest text-charcoal-900/60">Note: </span>
                <span className="italic text-charcoal-900/80">{order.notes}</span>
              </p>
            </>
          )}
          <Separator className="my-3" />
          {order.discountName && order.subtotal != null && (
            <div className="mb-2 flex flex-col gap-0.5 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₱{order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-700">
                <span>
                  {order.discountName} ({order.discountPercent}%)
                </span>
                <span>−₱{(order.discountAmount ?? 0).toFixed(2)}</span>
              </div>
            </div>
          )}
          <div className="flex justify-between text-lg font-extrabold">
            <span>Total</span>
            <span>₱{order.total.toFixed(0)}</span>
          </div>
        </div>

        <p className={`text-center text-sm font-bold ${cancelled ? "text-charcoal-900/70" : "text-achuete-600"}`}>
          {cancelled
            ? "Please see a staff member if you have any questions."
            : paid
              ? "Waiting… we'll call your number."
              : isCash
                ? "Please pay at the counter to confirm your order."
                : "Complete payment to confirm your order."}
        </p>
        {!cancelled && !paid && isCash && (
          <p className="-mt-3 text-center text-xs text-charcoal-900/60">
            Just give staff your order number — #{order.orderNo}.
          </p>
        )}

        <Button variant="secondary" className="w-full gap-2" onClick={handleDownload} disabled={downloading}>
          <Download size={16} /> {downloading ? "Preparing…" : "Download receipt"}
        </Button>
      </div>
    </div>
  );
}
