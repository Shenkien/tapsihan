import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Printer, XCircle } from "lucide-react";
import TornEdge from "@/components/order/TornEdge";
import { fetchGcashConfig, type GcashConfig } from "@/lib/gcashAccountInfo";
import { orderItemName, orderItemComboContents, type OrderRecord, type PaymentMethod } from "@/types/models";

// How long the payment screen stays up before it resets itself back to the
// start — for CASH the customer already has their printed "pay at the
// counter" ticket; for GCASH they now get a receipt with the QR/account
// details to pay from too (see OrderFlow's gcash-pending print). Either
// way there's no reason to keep the kiosk parked on this screen once the
// customer has what they need — that's exactly the bottleneck that leaves
// the kiosk unusable for the next customer while a line is waiting.
const KIOSK_AUTO_RESET_SECONDS = 15;

// Brand-colored confirmation banner shared by both the cash "not yet paid"
// and GCash "paid" success states — a maroon-and-gold band with a torn-
// paper edge, matching the kiosk welcome screen's poster look, instead of
// a bare checkmark floating on plain white.
function ThankYouBanner({
  subtitle,
  cancelled = false,
}: {
  subtitle: string;
  /** Swaps the checkmark/"Thank you!" success framing for a cancelled
   *  variant — this banner otherwise always reads as a success state, which
   *  is wrong to show for an order staff just cancelled. */
  cancelled?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-t-3xl pb-9 pt-7 text-center text-rice-50 ${
        cancelled ? "bg-charcoal-900" : "bg-leaf-900"
      }`}
    >
      {/* Faint confetti dots, gold and white, scattered behind the icon. */}
      <span className="absolute left-6 top-5 h-2 w-2 rounded-full bg-turmeric-500/70" aria-hidden />
      <span className="absolute right-8 top-9 h-1.5 w-1.5 rounded-full bg-rice-50/50" aria-hidden />
      <span className="absolute left-12 bottom-8 h-1.5 w-1.5 rounded-full bg-rice-50/40" aria-hidden />
      <span className="absolute right-6 bottom-10 h-2 w-2 rounded-full bg-turmeric-500/60" aria-hidden />

      <span
        className={`relative mx-auto flex h-20 w-20 items-center justify-center rounded-full shadow-brand ring-4 ring-white/15 ${
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
        {cancelled ? "Order cancelled" : "Thank you!"}
      </h2>
      <p className="relative text-rice-50/80">{subtitle}</p>

      {/* Torn-paper bottom edge, echoing the welcome screen's poster style,
          transitioning into the white card body below. */}
      <TornEdge color="text-white" />
    </div>
  );
}

// The kiosk's "new order" button and its countdown only clear THIS screen; the
// order itself is already saved on the server. Say so, so nobody believes
// tapping it cancelled anything. Unpaid orders are cancelled automatically
// after 30 minutes (see ORDER_EXPIRY_MS in lib/services/orderCancel.ts).
function SavedNotice() {
  return (
    <p className="text-center text-xs font-semibold text-charcoal-900/60">
      Your order is saved. Please pay at the counter within 30 minutes or it will be cancelled automatically.
    </p>
  );
}

export default function PaymentStep({
  order,
  paymentMethod,
  status,
  onSimulatePaid,
  onAutoReset,
  onPrintReceipt,
}: {
  order: OrderRecord;
  barcodeImage: string | null;
  paymentMethod: PaymentMethod;
  status: string;
  onSimulatePaid: (() => void) | null;
  onAutoReset?: () => void;
  /** Re-sends the receipt to the kiosk's USB thermal printer. Only passed
   *  in for real kiosk orders (see OrderFlow), so it's undefined on the
   *  QR/phone flow where there's no printer to send to. */
  onPrintReceipt?: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(KIOSK_AUTO_RESET_SECONDS);
  // null = still loading. status "error" = the settings fetch failed (show
  // retry); configured false = no QR saved yet (ask them to pay staff).
  const [gcashQr, setGcashQr] = useState<GcashConfig | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [qrAttempt, setQrAttempt] = useState(0);
  const retryQr = useCallback(() => {
    setGcashQr(null);
    setImageFailed(false);
    setQrAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!onAutoReset) return;
    if (secondsLeft <= 0) {
      onAutoReset();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [onAutoReset, secondsLeft]);

  // Fetches the store's actual GCash QR (maintained in Admin > Maintenance
  // > GCash Payment) instead of showing a plain "GCash merchant QR" text
  // placeholder — that placeholder never actually rendered a scannable
  // code, which meant a customer choosing GCash had nothing to scan.
  useEffect(() => {
    if (paymentMethod !== "GCASH" || status === "paid" || status === "cancelled") return;
    let cancelled = false;
    fetchGcashConfig().then((cfg) => {
      if (!cancelled) setGcashQr(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, [paymentMethod, status, qrAttempt]);

  if (paymentMethod === "CASH") {
    const isCancelled = status === "cancelled";
    return (
      <div className="animate-fade-up mx-auto w-full max-w-[380px] overflow-hidden rounded-3xl bg-white text-center shadow-brand">
        <ThankYouBanner
          subtitle={isCancelled ? "This order was cancelled." : "Your order has been placed."}
          cancelled={isCancelled}
        />

        <div className="flex flex-col items-center gap-5 p-6">
          <div className="w-full rounded-2xl border-2 border-turmeric-500 bg-turmeric-500/20 px-6 py-5 text-center shadow-brand">
            <p className="text-xs font-bold uppercase tracking-widest text-charcoal-900/60">Your order number</p>
            <p className="big-number text-6xl text-achuete-600">#{order.orderNo}</p>
          </div>

          <p className="text-sm text-charcoal-900/70">
            {isCancelled
              ? "Please see a staff member if you have any questions."
              : "Take this receipt to the counter and show it to staff to pay."}
          </p>
          {!isCancelled && <SavedNotice />}

          <div className="w-full rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1.5 text-left">
              {order.items.map((item) => {
                const combo = orderItemComboContents(item);
                return (
                  <div key={item.id} className="flex flex-col gap-0.5">
                    <div className="flex justify-between gap-3 text-sm">
                      <span>
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
                <p className="text-left text-sm">
                  <span className="font-extrabold uppercase tracking-widest text-charcoal-900/60">Note: </span>
                  <span className="italic text-charcoal-900/80">{order.notes}</span>
                </p>
              </>
            )}
            <Separator className="my-3" />
            <div className="flex justify-between text-lg font-extrabold">
              <span>Total due</span>
              <span>₱{order.total.toFixed(0)}</span>
            </div>
          </div>

          <p className="text-center text-sm opacity-60">
            A copy of this receipt has printed here at the kiosk. Your order won&apos;t be sent to
            the kitchen until staff confirms your payment.
          </p>

          {onPrintReceipt && (
            <Button variant="secondary" className="gap-2" onClick={onPrintReceipt}>
              <Printer size={16} /> Reprint receipt
            </Button>
          )}

          {onAutoReset && (
            <p className="text-center text-xs font-bold text-achuete-600">
              Starting a new order in {secondsLeft}s…
            </p>
          )}
        </div>
      </div>
    );
  }

  // GCASH
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {status === "paid" || status === "cancelled" ? (
        <div className="animate-fade-up mx-auto w-full max-w-[380px] overflow-hidden rounded-3xl bg-white shadow-brand">
          <ThankYouBanner
            subtitle={
              status === "cancelled" ? "This order was cancelled — please see staff." : "Payment received — we'll call your number."
            }
            cancelled={status === "cancelled"}
          />
          <div className="p-6">
            <div className="rounded-2xl border-2 border-turmeric-500 bg-turmeric-500/20 px-6 py-5 text-center shadow-brand">
              <p className="text-xs font-bold uppercase tracking-widest text-charcoal-900/60">Your order number</p>
              <p className="big-number text-6xl text-achuete-600">#{order.orderNo}</p>
            </div>
          </div>
          {status === "paid" && onPrintReceipt && (
            <div className="px-6 pb-6">
              <Button variant="secondary" className="w-full gap-2" onClick={onPrintReceipt}>
                <Printer size={16} /> Reprint receipt
              </Button>
            </div>
          )}
          {onAutoReset && (
            <p className="pb-6 text-center text-xs font-bold text-achuete-600">
              Starting a new order in {secondsLeft}s…
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-lg">Scan with your GCash app to pay ₱{order.total.toFixed(0)}</p>
          <div className="flex h-[220px] w-[220px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-white p-4 shadow-brand">
            {gcashQr === null ? (
              <span className="text-center text-sm font-bold text-charcoal-900/60">Loading QR…</span>
            ) : gcashQr.status === "error" ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="text-sm font-bold text-charcoal-900/60">Couldn&apos;t load the QR code.</span>
                <Button size="sm" variant="secondary" onClick={retryQr}>
                  Tap to retry
                </Button>
              </div>
            ) : gcashQr.imagePath && !imageFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={gcashQr.imagePath}
                alt="GCash QR code — scan to pay"
                className="h-full w-full object-contain"
                onError={() => setImageFailed(true)}
              />
            ) : imageFailed ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="text-sm font-bold text-charcoal-900/60">The QR image didn&apos;t load.</span>
                <Button size="sm" variant="secondary" onClick={retryQr}>
                  Tap to retry
                </Button>
              </div>
            ) : (
              <span className="text-center text-sm font-bold text-charcoal-900/60">
                QR not set up yet — please pay a staff member directly
              </span>
            )}
          </div>
          {gcashQr?.status === "ok" && (gcashQr.accountName || gcashQr.accountNumber) && (
            <p className="text-sm text-charcoal-900/60">
              {gcashQr.accountName}
              {gcashQr.accountName && gcashQr.accountNumber ? " · " : ""}
              {gcashQr.accountNumber}
            </p>
          )}
          <p className="text-lg font-bold text-achuete-600">
            Proceed to the counter and show your GCash payment.
          </p>
          <SavedNotice />
          {onSimulatePaid && (
            <Button variant="secondary" onClick={onSimulatePaid}>
              Simulate GCash Paid (dev)
            </Button>
          )}
          {/* The kiosk no longer waits here for the payment to land (see
              onAutoReset below) — a receipt with these same QR/account
              details already printed at order time, so the customer can
              step aside and pay from their phone at their own pace while
              this kiosk frees up for the next person in line. */}
          {onPrintReceipt && (
            <Button variant="secondary" className="gap-2" onClick={onPrintReceipt}>
              <Printer size={16} /> Reprint receipt
            </Button>
          )}
          {onAutoReset && (
            <p className="text-center text-xs font-bold text-achuete-600">
              Starting a new order in {secondsLeft}s…
            </p>
          )}
        </>
      )}
    </div>
  );
}
