"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";
import { usePayment } from "@/hooks/usePayment";
import { usePusherEvent } from "@/hooks/usePusherEvent";
import { toast } from "@/hooks/use-toast";
import KioskMenu from "@/components/order/KioskMenu";
import TornEdge from "@/components/order/TornEdge";
import Cart from "@/components/order/Cart";
import Checkout from "@/components/order/Checkout";
import PaymentProcessing from "@/components/order/PaymentProcessing";
import PaymentStep from "@/components/order/PaymentStep";
import DigitalReceipt from "@/components/order/DigitalReceipt";
import FullscreenToggle from "@/components/order/FullscreenToggle";
import { printThermalReceiptSilent } from "@/lib/printThermalRawBT";
import { getPrintMode } from "@/lib/printMode";
import { LogoMark } from "@/components/logo";
import { ChevronLeft, ChevronRight, ShoppingCart, UtensilsCrossed, ShoppingBag, Smile, Heart, ThumbsUp } from "lucide-react";
import type { MenuCombo, MenuProduct, OrderSource, OrderType, PaymentMethod } from "@/types/models";

const STEPS = {
  TYPE: "type",
  MENU: "menu",
  CART: "cart",
  CHECKOUT: "checkout",
  PROCESSING: "processing",
  PAY: "pay",
} as const;

type Step = (typeof STEPS)[keyof typeof STEPS];

export default function OrderFlow({ source }: { source: OrderSource }) {
  const [step, setStep] = useState<Step>(STEPS.TYPE);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [combos, setCombos] = useState<MenuCombo[]>([]);
  const cart = useCart();
  const payment = usePayment();

  // Physical printing on the counter's USB thermal printer only happens for
  // kiosk and staff-entered counter orders — a QR/phone order has no
  // printer sitting next to it. Tracks which orderNo has already been
  // auto-printed for each stage so a Pusher event + the status poll both
  // firing (or a re-render) never prints the same ticket twice.
  const printedRef = useRef<{ pending?: string; paid?: string }>({});

  // Guards against a double-tap on "Pay Now". A ref, not state, because the
  // second tap of a double-tap lands within a few milliseconds — before React
  // has re-rendered Checkout out of the tree — so a state flag set at the top
  // of handlePay isn't visible yet when the second call runs. Two orders got
  // created, stock was deducted twice, and two tickets printed. Touchscreens
  // make this routine rather than rare.
  const submittingRef = useRef(false);
  // Mirrors submittingRef for rendering only. The ref is what actually blocks
  // the second tap; this just greys the button out.
  const [submitting, setSubmitting] = useState(false);
  const hasPrinter = source === "KIOSK" || source === "COUNTER";

  // Tracks the outcome of a bridge print request (the non-Android path —
  // see printReceiptNow below). Previously this device just fired the POST
  // and assumed the receipt printed; now it waits for the bridge phone's
  // ack (or a timeout) and surfaces a retry button if it never confirms.
  // Not used for the direct-RawBT (Android) path — that one prints
  // synchronously and has no separate confirmation step today.
  const [bridgePrintStatus, setBridgePrintStatus] = useState<
    { orderNo: string; variant: "cash-pending" | "gcash-pending" | "paid"; state: "waiting" | "failed" } | null
  >(null);
  const bridgeAckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBridgeAckTimeout = useCallback(() => {
    if (bridgeAckTimeoutRef.current) {
      clearTimeout(bridgeAckTimeoutRef.current);
      bridgeAckTimeoutRef.current = null;
    }
  }, []);

  // Cleans up a pending timeout if this component unmounts mid-wait (e.g.
  // the customer backs out or the flow resets) so it doesn't fire against
  // an already-gone order.
  useEffect(() => clearBridgeAckTimeout, [clearBridgeAckTimeout]);

  // The bridge phone posts to /api/print-bridge/ack once it's actually
  // tried to print (see print-bridge/page.tsx), which broadcasts this
  // event. If it matches the order we're currently waiting on, that
  // resolves the "waiting" state one way or the other.
  usePusherEvent<{
    orderNo: string;
    variant: "cash-pending" | "gcash-pending" | "paid";
    status: "printed" | "failed";
    error?: string;
  }>(
    "receipt:print-result",
    (data) => {
      if (!payment.order || data.orderNo !== payment.order.orderNo) return;
      clearBridgeAckTimeout();
      if (data.status === "printed") {
        setBridgePrintStatus(null);
      } else {
        setBridgePrintStatus({ orderNo: data.orderNo, variant: data.variant, state: "failed" });
        toast({
          description: `Receipt didn't print for order #${data.orderNo} — the bridge phone reported a failure.`,
          variant: "destructive",
        });
      }
    }
  );

  const printReceiptNow = useCallback(
    (variant: "cash-pending" | "gcash-pending" | "paid") => {
      if (!payment.order) return;
      const orderNo = payment.order.orderNo;
      // Android tablets have RawBT installed and paired to the PT-210
      // directly, so they keep printing exactly as before. Any other
      // device with a printer (i.e. the iPad kiosk, which has no
      // Bluetooth connection to the printer at all) can't reach RawBT's
      // rawbt: URI scheme locally — instead it asks the Android phone
      // running /print-bridge to print on its behalf, over Pusher. See
      // src/app/print-bridge/page.tsx for the other end of this.
      // "direct" when this device has RawBT paired to a printer of its own
      // (Android by default); "bridge" when it doesn't (a PC, an iPad, or an
      // Android tablet whose printer is on a separate phone: open it once as
      // ?print=bridge). See lib/printMode.ts.
      if (getPrintMode() === "direct") {
        // Fire-and-forget, same as before — printThermalReceiptSilent is
        // now async only because "gcash-pending" fetches the store's GCash
        // account details before it hands the job to RawBT, not because
        // this call site needs to wait on it.
        printThermalReceiptSilent(payment.order, { barcodeImage: payment.barcodeImage, variant }).catch((err) =>
          console.error("Receipt print failed:", err)
        );
        return;
      }

      // Wait up to 8s for the bridge phone's ack before treating this as
      // failed — long enough for a normal print (fetch order + build PDF +
      // hand off to RawBT), short enough that staff aren't left guessing
      // for a full minute if the phone's tab really is closed.
      clearBridgeAckTimeout();
      setBridgePrintStatus({ orderNo, variant, state: "waiting" });
      bridgeAckTimeoutRef.current = setTimeout(() => {
        setBridgePrintStatus((prev) => (prev && prev.orderNo === orderNo && prev.variant === variant ? { ...prev, state: "failed" } : prev));
        toast({
          description: "No confirmation the receipt printed — is the bridge phone's tab open?",
          variant: "destructive",
        });
      }, 8000);

      fetch("/api/print-bridge/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo, variant }),
      }).catch(() => {
        clearBridgeAckTimeout();
        setBridgePrintStatus({ orderNo, variant, state: "failed" });
        toast({ description: "Couldn't reach the print bridge — is the phone's tab still open?", variant: "destructive" });
      });
    },
    [payment.order, payment.barcodeImage, clearBridgeAckTimeout]
  );

  useEffect(() => {
    if (!hasPrinter || !payment.order) return;
    const orderNo = payment.order.orderNo;

    if (paymentMethod === "CASH" && payment.status === "created" && printedRef.current.pending !== orderNo) {
      printedRef.current.pending = orderNo;
      printReceiptNow("cash-pending");
    }

    // GCash used to only print once staff tapped "Confirm GCash" — meaning
    // nothing printed at all while the kiosk sat on the QR screen, and the
    // customer had nothing in hand once the kiosk auto-reset (see below).
    // Printing here, the moment the order is created, mirrors what CASH
    // already does: the customer walks away with a receipt immediately,
    // this one telling them how to pay via GCash instead of "pay at the
    // counter".
    if (paymentMethod === "GCASH" && payment.status === "waiting" && printedRef.current.pending !== orderNo) {
      printedRef.current.pending = orderNo;
      printReceiptNow("gcash-pending");
    }

    if (payment.status === "paid" && printedRef.current.paid !== orderNo) {
      printedRef.current.paid = orderNo;
      printReceiptNow("paid");
    }
  }, [source, paymentMethod, payment.order, payment.status, printReceiptNow]);

  function loadProducts() {
    fetch("/api/products")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load products (${res.status})`);
        return res.json();
      })
      .then(setProducts)
      .catch((err) => {
        console.error(err);
        toast({ description: "Couldn't load the menu. Please try again.", variant: "destructive" });
      });
  }

  function loadCombos() {
    fetch("/api/combos")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load combos (${res.status})`);
        return res.json();
      })
      .then(setCombos)
      .catch((err) => {
        // Combos are a bonus tab, not the core menu — a failed fetch here
        // shouldn't block ordering, so this just logs instead of toasting.
        console.error(err);
      });
  }

  useEffect(() => {
    loadProducts();
    loadCombos();
  }, []);

  // Admin > Menu Items broadcasts "menu:updated" (new/edited/removed items,
  // a category rename, or a combo change) on the same Pusher channel
  // already used for order updates — refetch so a kiosk/QR tab left open
  // all day picks up menu changes live instead of needing a manual reload.
  usePusherEvent("menu:updated", () => {
    loadProducts();
    loadCombos();
  });

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);

  function addToCart(product: MenuProduct, perUnitAddOns: MenuProduct[][]) {
    // One unit at a time, each with its own add-ons — so "2x, only one
    // with Egg" adds the base product twice (same price either way, so it
    // merges fine) but the Egg only once, instead of forcing every unit
    // in the batch to share the same add-ons and total.
    perUnitAddOns.forEach((unitAddOns) => {
      cart.addItem(product, 1);
      unitAddOns.forEach((addOn) => cart.addItem(addOn, 1));
    });
    const qty = perUnitAddOns.length;
    toast({ description: `Added ${qty > 1 ? `${qty}x ` : ""}${product.name} to cart` });
  }

  function addComboToCart(combo: MenuCombo) {
    // Rides through the same cart/checkout/payment pipeline as a regular
    // product line — see the `isCombo` comment on MenuProduct — so it
    // needs the same shape, just marked as a combo instead of drawn from
    // `products`. A combo isn't customizable at the kiosk, so it's always
    // a single unit added at a time (no per-unit add-ons picker).
    const comboAsProduct: MenuProduct = {
      id: combo.id,
      name: combo.name,
      category: "Combos",
      price: combo.price,
      imageUrl: combo.imageUrl,
      inStock: combo.inStock,
      bestSeller: false,
      isNew: false,
      isCombo: true,
      comboItems: combo.items.map((i) => ({ name: i.name, qty: i.qty })),
    };
    cart.addItem(comboAsProduct, 1);
    toast({ description: `Added ${combo.name} to cart` });
  }

  function startOver() {
    cart.clear();
    payment.reset();
    printedRef.current = {};
    submittingRef.current = false;
    setSubmitting(false);
    setOrderType(null);
    setPaymentMethod(null);
    setStep(STEPS.TYPE);
  }

  // Cancels THIS customer's own unpaid order (the server checks a secret only
  // this screen has, and refuses once staff have taken payment).
  async function handleCancelOrder() {
    if (!window.confirm("Cancel this order? It won't be made and you won't be charged.")) return;
    const problem = await payment.cancelOrder();
    toast(
      problem
        ? { description: problem, variant: "destructive" }
        : { description: "Your order was cancelled." }
    );
  }

  async function handlePay(method: PaymentMethod) {
    if (!orderType) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setPaymentMethod(method);
    setStep(STEPS.PROCESSING);
    try {
      await payment.submitOrder({
        type: orderType,
        source,
        paymentMethod: method,
        items: cart.items,
        notes: cart.orderNote,
      });
      setStep(STEPS.PAY);
    } catch (err) {
      // submitOrder() rejects on any backend validation/business-logic
      // failure (insufficient stock, item deactivated, qty over the cap,
      // network error, etc.). Without this catch the kiosk was left
      // stuck on the "Processing..." screen forever with no way back —
      // the customer had to be manually reset by staff. Instead: tell
      // them what went wrong and return them to checkout so they can
      // adjust the order (e.g. drop the out-of-stock line) and retry.
      console.error(err);
      toast({
        description: err instanceof Error ? err.message : "Could not place your order. Please try again.",
        variant: "destructive",
      });
      setPaymentMethod(null);
      setStep(STEPS.CHECKOUT);
      // Released only on failure — the retry is the whole point of sending
      // them back to checkout. On success the order exists and the flow has
      // moved on, so the guard stays closed until startOver() resets it.
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const isQr = source === "QR";

  const flow = (
    <>
      {step === STEPS.TYPE && (
        <WelcomeScreen
          compact={isQr}
          exitHref={source === "COUNTER" ? "/staff" : undefined}
          showStaffLogin={source === "KIOSK"}
          onSelect={(type) => {
            setOrderType(type);
            setStep(STEPS.MENU);
          }}
        />
      )}

      {step === STEPS.MENU && (
        <KioskMenu
          products={products}
          categories={categories}
          combos={combos}
          cartCount={cart.itemCount}
          cartTotal={cart.total}
          cartQty={cart.items.reduce<Record<string, number>>((acc, item) => {
            const key = `${item.product.isCombo ? "c" : "p"}:${item.product.id}`;
            acc[key] = (acc[key] ?? 0) + item.qty;
            return acc;
          }, {})}
          orderType={orderType}
          onAddToCart={addToCart}
          onAddCombo={addComboToCart}
          onBack={() => setStep(STEPS.TYPE)}
          onViewCart={() => setStep(STEPS.CART)}
          compact={isQr}
        />
      )}

      {step === STEPS.CART && (
        <>
          <Header title="Your order" onBack={() => setStep(STEPS.MENU)} />
          <div className="flex-1 overflow-y-auto">
            <Cart
              items={cart.items}
              onSetQty={cart.setQty}
              onRemove={(i) => cart.removeItem(i)}
              total={cart.total}
              orderNote={cart.orderNote}
              onSetOrderNote={cart.setOrderNote}
            />
          </div>
          <BottomBar
            label={`Total: ₱${cart.total.toFixed(0)}`}
            actionLabel="Checkout"
            onAction={() => setStep(STEPS.CHECKOUT)}
            disabled={cart.itemCount === 0}
          />
        </>
      )}

      {step === STEPS.CHECKOUT && (
        <Checkout
          items={cart.items}
          total={cart.total}
          notes={cart.orderNote}
          orderType={orderType}
          onBack={() => setStep(STEPS.CART)}
          onPay={handlePay}
          submitting={submitting}
        />
      )}

      {step === STEPS.PROCESSING && <PaymentProcessing />}

      {step === STEPS.PAY && payment.order && paymentMethod && (
        <div className={`bg-brand-pattern flex min-h-0 flex-1 flex-col items-center overflow-y-auto ${isQr ? "px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4" : "p-6"}`}>
          {/* `m-auto` (not `justify-center` on the scroll container above)
              is what keeps this centered when it fits the screen. A tall
              order — many items — makes this taller than the viewport;
              with `justify-center` on an overflow-y-auto container, the
              content overflows equally on both sides of center and the
              top half becomes unreachable by scrolling no matter what.
              `margin: auto` collapses to 0 once content overflows instead,
              so it just becomes normal top-aligned, fully scrollable
              content. */}
          <div className={`m-auto flex w-full flex-col items-center ${isQr ? "gap-4" : "gap-6"}`}>
            {isQr ? (
              // Every QR order gets the digital receipt — cash or GCash —
              // instead of only GCash falling here and cash accidentally
              // landing on PaymentStep's kiosk-printed-ticket copy below.
              // There's no printer next to a phone either way.
              <DigitalReceipt
                order={payment.order}
                paid={payment.status === "paid"}
                cancelled={payment.status === "cancelled"}
              />
            ) : (
              <PaymentStep
                order={payment.order}
                barcodeImage={payment.barcodeImage}
                paymentMethod={paymentMethod}
                status={payment.status}
                onSimulatePaid={
                  paymentMethod === "GCASH" && payment.canSimulateGcashPaid ? payment.simulateGcashPaid : null
                }
                // Both CASH and GCASH now auto-reset the kiosk on the same
                // countdown instead of only CASH — the kiosk already handed
                // the customer a receipt (with a QR or account number to
                // pay from), so there's no reason to keep it camped on this
                // screen waiting for a GCash payment to land; that's what
                // was blocking the next customer in line from ordering.
                onAutoReset={startOver}
                onPrintReceipt={
                  hasPrinter
                    ? () =>
                        printReceiptNow(
                          payment.status === "paid" ? "paid" : paymentMethod === "GCASH" ? "gcash-pending" : "cash-pending"
                        )
                    : undefined
                }
              />
            )}
            {hasPrinter && bridgePrintStatus?.orderNo === payment.order.orderNo && (
              <div className="flex flex-col items-center gap-2 rounded-lg bg-charcoal-900/5 px-4 py-3 text-center text-sm">
                {bridgePrintStatus.state === "waiting" ? (
                  <p>Sending receipt to the printer…</p>
                ) : (
                  <>
                    <p className="text-red-700">Receipt may not have printed.</p>
                    <Button size="sm" onClick={() => printReceiptNow(bridgePrintStatus.variant)}>
                      Retry print
                    </Button>
                  </>
                )}
              </div>
            )}
            {isQr &&
              paymentMethod === "GCASH" &&
              payment.status !== "paid" &&
              payment.status !== "cancelled" &&
              payment.canSimulateGcashPaid && (
                <Button variant="secondary" onClick={payment.simulateGcashPaid}>
                  Simulate GCash Paid (dev)
                </Button>
              )}
            {payment.canCancel && (
              <Button
                variant="ghost"
                className="text-red-700"
                disabled={payment.cancelling}
                onClick={handleCancelOrder}
              >
                {payment.cancelling ? "Cancelling…" : "Cancel this order"}
              </Button>
            )}
            <Button variant="ghost" onClick={startOver}>
              {/* This only clears the screen — the order is already saved
                  (see PaymentStep's notice), so it must not say "Cancel". */}
              {payment.status === "paid" || payment.status === "cancelled"
                ? "New Order"
                : "Done — new order"}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  // Kiosk runs edge-to-edge on its own dedicated tablet, so it keeps the
  // plain full-viewport `.screen`. A QR order is opened on the customer's
  // own phone but previewed at every width from a small phone up through
  // a tablet or a desktop browser tab — so past the phone breakpoint it's
  // presented as a bounded, shadowed "phone" card centered on a quiet
  // backdrop instead of a screen-wide layout stretched to a huge canvas.
  if (isQr) {
    return (
      <div className="bg-brand-pattern flex min-h-dvh flex-col bg-rice-100 sm:items-center sm:justify-center sm:p-6">
        <div className="flex h-dvh w-full flex-col overflow-hidden bg-rice-50 sm:h-[min(880px,90dvh)] sm:max-w-[440px] sm:rounded-[28px] sm:shadow-2xl sm:ring-1 sm:ring-charcoal-900/10">
          {flow}
        </div>
      </div>
    );
  }

  return (
    <div className="screen bg-rice-50">
      {source === "KIOSK" && <FullscreenToggle />}
      {flow}
    </div>
  );
}

function WelcomeScreen({
  compact,
  exitHref,
  showStaffLogin = false,
  onSelect,
}: {
  // `compact` = the QR flow's phone-card frame; the kiosk gets the full
  // poster-sized treatment. Same brand markup either way (maroon header,
  // hand-marker wordmark, torn-paper edge, pill buttons, footer trio) so
  // scanning the QR code never feels like landing on a different, plainer
  // app — just a version sized for the phone in your hand.
  compact: boolean;
  // Only set for a staff-entered counter order — a real kiosk/QR customer
  // has nowhere else to go, but staff taking a walk-in's order need a way
  // back to the queue without finishing an order first.
  exitHref?: string;
  // Kiosk welcome screen only: a visible, finger-sized way to reach the
  // Staff/Admin login from any device (phone, tablet) that opens the site,
  // so nobody has to type /staff or /admin into the address bar.
  showStaffLogin?: boolean;
  onSelect: (type: OrderType) => void;
}) {
  return (
    <div
      className={`relative flex flex-1 flex-col bg-rice-50 text-charcoal-900 ${
        compact ? "overflow-y-auto" : "overflow-hidden"
      }`}
    >
      <div className={`relative shrink-0 overflow-hidden bg-leaf-900 pt-[clamp(0.75rem,3dvh,2rem)] text-center text-rice-50 ${compact ? "pb-[clamp(1rem,3dvh,2rem)]" : "pb-[clamp(1.25rem,3.5dvh,2.5rem)]"}`}>
        {/* Same tomato/garlic line-art texture used on the kiosk's maroon
            category nav (KioskMenu), so every maroon band in the kiosk —
            not just the tab bar — carries the same background design. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            backgroundImage: "url(/assets/patterns/header-pattern.svg)",
            backgroundRepeat: "repeat",
            backgroundSize: "300px 169px",
          }}
          aria-hidden
        />

        {exitHref && (
          <Link
            href={exitHref}
            className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-white/10 py-1.5 pl-2 pr-3.5 text-xs font-extrabold uppercase tracking-wide text-rice-50 transition hover:bg-white/20"
          >
            <ChevronLeft size={16} /> Staff
          </Link>
        )}

        {/* Ribbon tag ("SULIT. MASARAP. PANG-ARAW-ARAW!") removed for all
            breakpoints per request — kept crowding the header at every
            width it was tried at. */}

        <div className="animate-fade-up relative mx-auto flex max-w-3xl flex-col items-center gap-[clamp(0.25rem,1dvh,0.5rem)] px-6">
          <LogoMark
            className={compact ? "h-11 w-11 drop-shadow-sm" : "h-[clamp(2.75rem,min(8vw,9dvh),6.5rem)] w-[clamp(2.75rem,min(8vw,9dvh),6.5rem)] drop-shadow-sm lg:h-[clamp(3rem,min(6vw,10dvh),8rem)] lg:w-[clamp(3rem,min(6vw,10dvh),8rem)]"}
          />
          <h1
            className={`font-marker -rotate-1 leading-none ${
              compact ? "text-4xl" : "text-[clamp(2.25rem,min(8vw,9dvh),6.5rem)] lg:text-[clamp(2.5rem,min(6vw,10dvh),8rem)]"
            }`}
          >
            KUY&apos;S
          </h1>
          <h1
            className={`font-marker rotate-1 leading-none text-turmeric-500 ${
              compact ? "text-4xl" : "text-[clamp(2.25rem,min(8vw,9dvh),6.5rem)] lg:text-[clamp(2.5rem,min(6vw,10dvh),8rem)]"
            }`}
          >
            TAPSIHAN
          </h1>
        </div>

        {/* Torn-paper bottom edge into the cream section below. */}
        <TornEdge />
      </div>

      {/* "Simple. Sarap. Solid." — moved out from under the title (it was
          crowding the header) to sit just under the torn edge instead,
          in the maroon the header itself uses, filling what used to be
          dead space above "How will you eat today?" */}
      <p
        className={`shrink-0 pt-[clamp(0.5rem,2dvh,1rem)] text-center font-extrabold uppercase tracking-[0.25em] text-leaf-900 ${
          compact ? "text-[11px]" : "text-xs sm:text-sm lg:text-base"
        }`}
      >
        Simple. Sarap. Solid.
      </p>

      <div
        className={`animate-fade-up flex min-h-0 flex-1 flex-col items-center gap-[clamp(0.75rem,3dvh,2rem)] px-4 py-[clamp(0.5rem,2dvh,3rem)] sm:px-6 lg:gap-[clamp(1.5rem,4dvh,3rem)] lg:py-[clamp(1.5rem,3dvh,4rem)] ${
          compact ? "justify-start" : "justify-start md:justify-center xl:justify-start"
        }`}
        style={{ animationDelay: "120ms" }}
      >
        {/* Everything below is wrapped together (not just centered in the
            leftover flex-1 space) so the dish accents — anchored to this
            wrapper's own vertical center — always stay level with the
            DINE-IN/TAKEOUT buttons, no matter how tall this section ends
            up or how the surplus space is distributed around it.
            On tablet widths (md/lg, no dish accents) the OUTER flex above
            switches to justify-center instead, so this whole block sits
            in the middle of the leftover space rather than pinned to the
            top with dead air underneath. */}
        <div className="relative flex w-full flex-col items-center gap-[clamp(0.75rem,3dvh,2rem)] lg:gap-[clamp(1.5rem,4dvh,3rem)]">
          {/* Side dish photos on a brand-gold paint-splash backdrop —
              bleeding off the left/right edges like the shop's own promo
              poster. Kiosk only: there's no spare width for this on the
              QR flow's ~440px phone card, so it's skipped there entirely
              rather than fighting for room with the order buttons.
              Also skipped through tablet widths (md/lg, up to 1279px) —
              at those widths the images had nowhere to go but on top of
              the header or the buttons, so they only come in at xl
              (1280px+), once there's real spare width on either side. */}
          {!compact && (
            <>
              <DishAccent
                side="left"
                splashSrc="/assets/brand/splash-yellow.png"
                dishSrc="/assets/brand/dish-tapsilog-leaf.png"
              />
              <DishAccent
                side="right"
                splashSrc="/assets/brand/splash-yellow-mirror.png"
                dishSrc="/assets/brand/dish-tapsilog-bowl.png"
              />
            </>
          )}

          <h2
            className={`flex items-center gap-3 text-center font-display font-extrabold italic ${
              compact
                ? "text-lg min-[380px]:text-xl"
                : "text-[clamp(1.25rem,min(3.4vw,4dvh),3rem)] md:text-[clamp(1.75rem,min(3vw,4.5dvh),3.25rem)] lg:text-[clamp(1.75rem,min(3vw,5dvh),3.5rem)]"
            }`}
          >
            <span className="text-turmeric-500">—</span> How will you eat today?{" "}
            <span className="text-turmeric-500">—</span>
          </h2>

          <div className={`flex w-full flex-col gap-[clamp(0.5rem,1.5dvh,1rem)] ${compact ? "max-w-md" : "max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl"}`}>
            <button
              type="button"
              onClick={() => onSelect("DINE_IN")}
              className={`group flex items-center gap-4 rounded-full bg-achuete-600 text-white shadow-brand transition hover:-translate-y-0.5 hover:bg-achuete-700 active:scale-[0.98] ${
                compact ? "py-[clamp(0.5rem,1.5dvh,0.75rem)] pl-3 pr-6" : "py-[clamp(0.5rem,1.5dvh,0.75rem)] pl-3 pr-6 md:py-[clamp(0.65rem,1.8dvh,0.9rem)] md:pl-4 md:pr-7 lg:py-[clamp(0.75rem,2dvh,1rem)] lg:pl-4 lg:pr-8"
              }`}
            >
              <span
                className={`flex shrink-0 items-center justify-center rounded-full bg-white/15 ${
                  compact ? "h-12 w-12" : "h-12 w-12 md:h-14 md:w-14 lg:h-16 lg:w-16"
                }`}
              >
                <UtensilsCrossed className={compact ? "" : "md:h-7 md:w-7 lg:h-8 lg:w-8"} size={24} />
              </span>
              <span
                className={`flex-1 text-left font-extrabold uppercase tracking-wide ${
                  compact ? "text-lg" : "text-lg md:text-xl lg:text-2xl"
                }`}
              >
                Dine-in
              </span>
              <ChevronRight
                className={`shrink-0 opacity-70 transition group-hover:translate-x-1 group-hover:opacity-100 ${
                  compact ? "" : "md:h-6 md:w-6 lg:h-7 lg:w-7"
                }`}
                size={22}
              />
            </button>
            <button
              type="button"
              onClick={() => onSelect("TAKEOUT")}
              className={`group flex items-center gap-4 rounded-full bg-turmeric-500 text-charcoal-900 shadow-brand transition hover:-translate-y-0.5 active:scale-[0.98] ${
                compact ? "py-[clamp(0.5rem,1.5dvh,0.75rem)] pl-3 pr-6" : "py-[clamp(0.5rem,1.5dvh,0.75rem)] pl-3 pr-6 md:py-[clamp(0.65rem,1.8dvh,0.9rem)] md:pl-4 md:pr-7 lg:py-[clamp(0.75rem,2dvh,1rem)] lg:pl-4 lg:pr-8"
              }`}
            >
              <span
                className={`flex shrink-0 items-center justify-center rounded-full bg-charcoal-900/10 ${
                  compact ? "h-12 w-12" : "h-12 w-12 md:h-14 md:w-14 lg:h-16 lg:w-16"
                }`}
              >
                <ShoppingBag className={compact ? "" : "md:h-7 md:w-7 lg:h-8 lg:w-8"} size={24} />
              </span>
              <span
                className={`flex-1 text-left font-extrabold uppercase tracking-wide ${
                  compact ? "text-lg" : "text-lg md:text-xl lg:text-2xl"
                }`}
              >
                Takeout
              </span>
              <ChevronRight
                className={`shrink-0 opacity-70 transition group-hover:translate-x-1 group-hover:opacity-100 ${
                  compact ? "" : "md:h-6 md:w-6 lg:h-7 lg:w-7"
                }`}
                size={22}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Footer trio — same friendly sign-off as the poster. */}
      <div
        className={`flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border bg-white px-6 py-[clamp(0.5rem,2dvh,1.25rem)] text-center font-extrabold uppercase leading-tight text-charcoal-900/70 lg:py-[clamp(0.75rem,2.5dvh,1.5rem)] ${
          compact ? "text-[11px]" : "text-[11px] gap-x-8 lg:text-sm lg:gap-x-12"
        }`}
      >
        <span className="flex items-center gap-2">
          <Smile size={compact ? 16 : 18} className="text-turmeric-500 lg:h-5 lg:w-5" /> Good food
          <br />
          Good mood
        </span>
        <span className="flex items-center gap-2">
          <Heart size={compact ? 16 : 18} className="text-achuete-600 lg:h-5 lg:w-5" /> Made fresh
          <br />
          Made with care
        </span>
        <span className="flex items-center gap-2">
          <ThumbsUp size={compact ? 16 : 18} className="text-turmeric-500 lg:h-5 lg:w-5" /> Thank you!
          <br />
          Come again!
        </span>
      </div>

      {/* Staff/admin way in: tucked into the bottom-right corner and nearly
          invisible so customers don't notice it — staff know where it is. */}
      {showStaffLogin && (
        <Link
          href="/login?fresh=1"
          prefetch={false}
          aria-label="Login"
          className="fixed bottom-0 right-0 z-10 flex min-h-11 items-center px-4 pb-[env(safe-area-inset-bottom)] text-[10px] font-semibold text-charcoal-900/15 transition-colors hover:text-charcoal-900/60"
        >
          Login
        </Link>
      )}
    </div>
  );
}

// One side's flanking food photo — a brand-gold paint splash behind a
// cropped dish photo, bled slightly off the screen edge like the shop's
// own promo poster. Two plain <img>s stacked instead of one pre-flattened
// image so either layer (splash color, dish photo) can be swapped later
// without regenerating the other.
function DishAccent({
  side,
  splashSrc,
  dishSrc,
}: {
  side: "left" | "right";
  splashSrc: string;
  dishSrc: string;
}) {
  return (
    <div
      style={
        {
          // NOTE: this was previously clamp(40rem,22vw,30rem) — an invalid
          // range (min 40rem > max 30rem), which meant the browser just
          // used the 40rem floor at every width and the image never
          // actually scaled with the viewport. That's the root cause of
          // it looking "too close" at 1336px and "too far apart" at
          // 1920px: the image size + push below were constant in px while
          // the centered content column kept resizing around them. Now
          // that it's a real min/preferred/max, the image (and the push,
          // below) grow smoothly between the xl breakpoint (1280px,
          // where these first turn on) and ~1920px. Nudge the three
          // numbers in each clamp() to taste — smaller max = tighter to
          // the center content, smaller push = closer to the screen edge.
          "--dish-accent-w": "clamp(40rem,22vw,40rem)",
          // How far each image is pushed away from the center, beyond its
          // default flush-with-the-edge position. Increase to move the
          // two images further apart; decrease (or use a negative value)
          // to pull them back toward the middle. Now scales with the
          // viewport too, instead of a fixed 20rem, so the gap next to
          // the buttons stays roughly consistent as the window widens.
          "--dish-accent-push": "clamp(20rem,9vw,13rem)",
        } as React.CSSProperties
      }
      className={`pointer-events-none absolute top-1/2 z-20 hidden w-[var(--dish-accent-w)] -translate-y-1/2 xl:block ${
        side === "left"
          ? "left-[calc(-1*var(--dish-accent-push))]"
          : "right-[calc(-1*var(--dish-accent-push))]"
      }`}
      aria-hidden
    >
      <div className="relative aspect-square w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={splashSrc} alt="" className="absolute inset-0 h-full w-full" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dishSrc}
          alt=""
          className="absolute left-1/2 top-1/2 w-[92%] -translate-x-1/2 -translate-y-1/2 drop-shadow-xl"
        />
      </div>
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-3 bg-leaf-900 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-rice-50 shadow-md sm:px-5 sm:pb-4 sm:pt-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
      >
        <ChevronLeft size={22} />
      </button>
      <h2 className="text-xl">{title}</h2>
    </div>
  );
}

function BottomBar({
  label,
  actionLabel,
  onAction,
  onBack,
  disabled,
}: {
  label: string;
  actionLabel: string;
  onAction: () => void;
  onBack?: () => void;
  disabled: boolean;
}) {
  return (
    <div className="sticky bottom-0 flex shrink-0 items-center justify-between gap-3 border-t border-border bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_20px_-8px_rgba(139,0,0,0.15)]">
      {onBack ? (
        <button type="button" onClick={onBack} className="text-sm font-bold uppercase tracking-wide text-charcoal-900/70">
          ← Back
        </button>
      ) : (
        <span className="min-w-0 truncate text-lg font-extrabold">{label}</span>
      )}
      <Button className="min-w-0 shrink-0 gap-2 px-5 sm:min-w-[160px] sm:px-7" onClick={onAction} disabled={disabled}>
        <ShoppingCart size={18} />
        {onBack ? label : actionLabel}
      </Button>
    </div>
  );
}
