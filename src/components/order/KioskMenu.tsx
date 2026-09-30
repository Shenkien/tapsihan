"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Minus, Plus, ShoppingBag, ShoppingCart, Sparkles, Star, UtensilsCrossed, X } from "lucide-react";
import { categoryIconSrc, iconForCategory, sortCategories } from "@/components/order/categoryIcon";
import { LogoMark } from "@/components/logo";
import type { MenuCombo, MenuProduct } from "@/types/models";

// Pseudo-category id for the Combos tab — combos aren't Products and don't
// have a real `category` string, so this is only ever compared against
// `currentCategory`, never sent anywhere or matched against real data.
const COMBOS_TAB = "Combos";

// The shop's own short blurb per category, from the menu board photos —
// purely decorative copy under the section title, not menu data. One entry
// per category in categoryIcon.tsx's CATEGORY_ORDER, in the same order, so
// it's easy to spot if a category is ever added there without a tagline
// here (it just falls back to no subtitle — see the render below — rather
// than breaking).
const CATEGORY_TAGLINES: Record<string, string> = {
  Lugaw: "Warm, hearty, and satisfying.",
  Sizzling: "Served hot on the plate, straight off the grill.",
  "Silog Meals": "Rice, egg, and your favorite ulam.",
  Soup: "Slow-cooked and soul-warming.",
  "Side Order": "Perfect on the side, or on their own.",
  Drinks: "Ice-cold, straight from the cooler.",
  // Covers every item the shop sells as its own standalone poster/sign
  // rather than under a named board (Chicken Inasal, Letchon Manok, Bicol
  // Express, Peking Duck, Laing, Kang Kong, Mr. Baka steak, etc.) — see
  // prisma/seed.ts for the full reasoning behind this category.
  "Special Meal": "Shop favorites that don't fit under one board — try something new.",
  "Add-Ons": "A little extra, on top of anything you order.",
  [COMBOS_TAB]: "Bundle up and save.",
};

export default function KioskMenu({
  products,
  categories,
  combos,
  cartCount,
  cartTotal,
  cartQty = {},
  orderType = null,
  onAddToCart,
  onAddCombo,
  onBack,
  onViewCart,
  compact = false,
}: {
  products: MenuProduct[];
  categories: string[];
  combos: MenuCombo[];
  cartCount: number;
  cartTotal: number;
  /** How many of each item are already in the cart, keyed "p:<productId>" or "c:<comboId>". */
  cartQty?: Record<string, number>;
  /** The Dine-in / Takeout choice made on the previous screen. */
  orderType?: "DINE_IN" | "TAKEOUT" | null;
  onAddToCart: (product: MenuProduct, perUnitAddOns: MenuProduct[][]) => void;
  onAddCombo: (combo: MenuCombo) => void;
  onBack: () => void;
  onViewCart: () => void;
  /** Phone layout (QR ordering): 2-column grid, two-row header, full-width cart bar. */
  compact?: boolean;
}) {
  // Combos get their own tab, promoted to the front of the nav — the same
  // way a physical counter puts the bundle-deal poster front and center.
  const orderedCategories = useMemo(() => {
    const base = sortCategories(categories);
    return combos.length > 0 ? [COMBOS_TAB, ...base] : base;
  }, [categories, combos.length]);
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const [justAddedCombo, setJustAddedCombo] = useState<number | null>(null);

  const currentCategory = activeCategory ?? orderedCategories[0];
  const showingCombos = currentCategory === COMBOS_TAB && !query;

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (query) return p.name.toLowerCase().includes(query.toLowerCase());
      return p.category === currentCategory;
    });
  }, [products, currentCategory, query]);

  // A single shared "Add-Ons" category now applies across every parent
  // item (Egg, Extra Rice, etc. all live there) instead of a separate
  // "<Category> Add-ons" category per parent — so this checks for that
  // one category directly. Guarded against an Add-Ons item itself (e.g.
  // tapping "Egg" from within the Add-Ons tab) opening a picker on itself.
  function hasAddOns(product: MenuProduct) {
    if (product.category === "Add-Ons") return false;
    return products.some((p) => p.category === "Add-Ons" && p.inStock);
  }

  function handleCardTap(product: MenuProduct) {
    if (hasAddOns(product)) {
      setSelected(product);
      return;
    }
    onAddToCart(product, [[]]);
    setJustAdded(product.id);
    window.setTimeout(() => setJustAdded((id) => (id === product.id ? null : id)), 900);
  }

  function handleComboTap(combo: MenuCombo) {
    if (!combo.inStock) return;
    onAddCombo(combo);
    setJustAddedCombo(combo.id);
    window.setTimeout(() => setJustAddedCombo((id) => (id === combo.id ? null : id)), 900);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-rice-50 text-charcoal-900">
      {/* Header — brand lockup left, search center, cart indicator right. */}
      <div
        className={`relative flex flex-wrap items-center border-b border-border bg-rice-50 ${
          compact ? "gap-x-2.5 gap-y-2.5 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]" : "gap-4 px-5 py-4"
        }`}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-leaf-900/5 text-leaf-900 transition hover:bg-leaf-900/10"
        >
          <ChevronLeft size={22} />
        </button>

        {/* The resource pack's own logo.svg badge is a placeholder (just a
            crossed-line "X" in a circle) that reads as a broken image at
            header size — using the app's existing hand-drawn crest instead,
            same brand colors, actually recognizable as a mark. */}
        <div className={`flex items-center gap-2 ${compact ? "min-w-0 flex-1" : "shrink-0"}`}>
          <LogoMark className={compact ? "h-9 w-9 shrink-0 drop-shadow-sm" : "h-11 w-11 drop-shadow-sm"} />
          <div className="min-w-0 leading-none">
            <span className={`font-marker block truncate text-leaf-900 ${compact ? "text-base" : "text-lg"}`}>
              Kuy&apos;s Tapsihan
            </span>
            {!compact && (
              <span className="block text-[9px] font-extrabold uppercase tracking-[0.18em] text-charcoal-900/50">
                Simple. Sarap. Solid.
              </span>
            )}
          </div>
        </div>

        {orderType && (
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full bg-leaf-900 py-1.5 text-xs font-extrabold uppercase tracking-wide text-rice-50 ${
              compact ? "px-2.5" : "px-3"
            }`}
          >
            {orderType === "DINE_IN" ? <UtensilsCrossed size={14} /> : <ShoppingBag size={14} />}
            {orderType === "DINE_IN" ? "Dine-in" : "Takeout"}
          </span>
        )}

        <div className={`relative order-last w-full ${compact ? "" : "sm:order-none sm:ml-2 sm:max-w-sm sm:flex-1"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/icons/icon-search.svg"
            alt=""
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a meal..."
            className={`w-full rounded-full border border-border bg-white pl-11 pr-4 outline-none transition focus:border-leaf-900 ${
              compact ? "py-2.5 text-base" : "py-3 text-base sm:text-sm"
            }`}
          />
        </div>

        {/* Ribbon flourish — matches the shop's own promo signage. Brush
            accent used sparingly, for branding only, per the design system. */}
        <span className="ml-auto hidden shrink-0 -rotate-2 rounded-md bg-turmeric-500 px-3 py-2 text-right text-[11px] font-extrabold uppercase leading-tight tracking-wide text-charcoal-900 shadow-sm md:block">
          Masarap.
          <br />
          Pang-araw-araw!
        </span>
      </div>

      {/* Category nav — fixed below the header, brand icons, large touch targets. */}
      <div className={`relative flex shrink-0 gap-2 overflow-x-auto bg-leaf-700 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}>
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            backgroundImage: "url(/assets/patterns/header-pattern.svg)",
            backgroundRepeat: "repeat",
            backgroundSize: "300px 169px",
          }}
          aria-hidden
        />
        <div className="relative flex gap-2">
          {orderedCategories.map((cat) => {
            const active = cat === currentCategory && !query;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setActiveCategory(cat);
                  setQuery("");
                }}
                className={
                  active
                    ? "flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-turmeric-500 pl-1.5 pr-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-charcoal-900 shadow-md ring-2 ring-white"
                    : "flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-white/10 pl-1.5 pr-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-rice-50/85 transition hover:bg-white/20"
                }
              >
                {/* Icons are drawn in fixed maroon/yellow, so on a maroon or
                    yellow pill they'd disappear — a cream chip behind each one
                    keeps every icon legible no matter which pill it's on. */}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rice-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cat === COMBOS_TAB ? "/brand/icons/icon-addons.svg" : categoryIconSrc(cat)} alt="" className="h-[18px] w-[18px]" />
                </span>
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content — category title + grid. Card size is fixed (image
          area keeps a consistent aspect ratio), so cards never stretch
          taller/shorter depending on how many items are in a category.
          Categories with more items than fit on screen simply scroll —
          the nav above and the cart bar below stay put since they live
          outside this scrolling container. */}
      <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${compact ? "px-3 py-3" : "px-6 py-4"}`}>
        {!query && (
          <div className="mb-3 flex shrink-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentCategory === COMBOS_TAB ? "/brand/icons/icon-addons.svg" : categoryIconSrc(currentCategory)}
              alt=""
              className={compact ? "h-8 w-8" : "h-10 w-10"}
            />
            <div className="min-w-0">
              <h1 className={`font-marker leading-tight text-leaf-900 ${compact ? "text-2xl" : "text-3xl"}`}>{currentCategory}</h1>
              {CATEGORY_TAGLINES[currentCategory] && (
                <p className="text-xs font-bold uppercase tracking-wide text-charcoal-900/50">
                  {CATEGORY_TAGLINES[currentCategory]}
                </p>
              )}
            </div>
          </div>
        )}

        {showingCombos ? (
          combos.length > 0 ? (
            <div className={`grid grid-cols-2 content-start gap-3 pb-2 ${compact ? "" : "sm:grid-cols-3 xl:grid-cols-4"}`}>
              {combos.map((combo) => (
                <ComboCard
                  key={combo.id}
                  combo={combo}
                  inCart={cartQty[`c:${combo.id}`] ?? 0}
                  justAdded={justAddedCombo === combo.id}
                  onTap={() => handleComboTap(combo)}
                  compact={compact}
                />
              ))}
            </div>
          ) : (
            <p className="flex flex-1 items-center justify-center p-4 text-charcoal-900/60">
              No combos available right now.
            </p>
          )
        ) : filtered.length > 0 ? (
          <div className={`grid grid-cols-2 content-start gap-3 pb-2 ${compact ? "" : "sm:grid-cols-3 xl:grid-cols-4"}`}>
            {filtered.map((product) => {
              const Icon = iconForCategory(product.category);
              const inCart = cartQty[`p:${product.id}`] ?? 0;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleCardTap(product)}
                  disabled={!product.inStock}
                  className={`group flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-1 hover:border-leaf-900 hover:shadow-brand disabled:pointer-events-none disabled:opacity-40 ${
                    inCart > 0 ? "border-leaf-900 ring-2 ring-leaf-900/40" : "border-border"
                  }`}
                >
                  <span className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden bg-turmeric-500/15 text-leaf-900">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center">
                        <Icon size={38} />
                      </span>
                    )}
                    {(product.bestSeller || product.isNew) && (
                      <span className="absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
                        {product.bestSeller && (
                          <span className="flex items-center gap-1 rounded-full bg-turmeric-500 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-charcoal-900 shadow-md">
                            <Star size={12} fill="currentColor" /> {compact ? "Best" : "Best Seller"}
                          </span>
                        )}
                        {product.isNew && (
                          <span className="flex items-center gap-1 rounded-full bg-leaf-900 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-rice-50 shadow-md">
                            <Sparkles size={12} /> New
                          </span>
                        )}
                      </span>
                    )}
                    {inCart > 0 && (
                      <span className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-leaf-900 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-rice-50 shadow-md">
                        <ShoppingCart size={12} /> {compact ? `×${inCart}` : `${inCart} in cart`}
                      </span>
                    )}
                    {!product.inStock && (
                      <span className="absolute inset-0 flex items-center justify-center bg-charcoal-900/50">
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-danger">
                          Out of stock
                        </span>
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center transition group-hover:scale-110"
                    >
                      {justAdded === product.id ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src="/brand/icons/icon-check.svg" alt="" className="h-11 w-11" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src="/brand/icons/icon-plus.svg" alt="" className="h-11 w-11" />
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col gap-0.5 p-2">
                    <p
                      className={`text-sm font-bold leading-tight ${
                        compact ? "line-clamp-2 min-h-[2.25rem] break-words" : "truncate"
                      }`}
                    >
                      {product.name.replace(/\s*\(Add-on\)\s*$/i, "")}
                    </p>
                    <span className="big-number text-leaf-900">₱{product.price}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="flex flex-1 items-center justify-center p-4 text-charcoal-900/60">
            Nothing found. Try a different search or category.
          </p>
        )}
      </div>

      {/* Cart bar — sits outside the scrolling content above, so it stays
          pinned to the bottom of the screen instead of scrolling away. */}
      <div
        className={`sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-4 border-t border-border bg-white shadow-[0_-4px_20px_-8px_rgba(139,0,0,0.15)] ${
          compact ? "px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3" : "px-5 py-3.5"
        }`}
      >
        {/* The header already has a Back button on phones — a second one
            down here just stole width from the cart button. */}
        {!compact && (
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-bold uppercase tracking-wide text-charcoal-900/70"
          >
            ← Back
          </button>
        )}
        <button
          type="button"
          onClick={onViewCart}
          disabled={cartCount === 0}
          className={`flex min-h-[56px] items-center justify-center gap-2.5 rounded-full bg-leaf-900 text-sm font-extrabold uppercase tracking-wide text-rice-50 shadow-brand transition hover:-translate-y-0.5 hover:bg-leaf-700 disabled:pointer-events-none disabled:opacity-40 ${
            compact ? "w-full px-4" : "px-6"
          }`}
        >
          <ShoppingCart size={18} />
          {compact && cartCount === 0
            ? "Tap an item to start"
            : `${compact ? "View cart · " : ""}${cartCount} item${cartCount === 1 ? "" : "s"} · ₱${cartTotal.toFixed(0)}`}
        </button>
      </div>

      {selected && (
        <ItemDetailModal
          product={selected}
          addOns={products.filter((p) => p.category === "Add-Ons" && p.inStock)}
          onClose={() => setSelected(null)}
          onAddToCart={(perUnitAddOns) => {
            onAddToCart(selected, perUnitAddOns);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function ItemDetailModal({
  product,
  addOns,
  onClose,
  onAddToCart,
}: {
  product: MenuProduct;
  addOns: MenuProduct[];
  onClose: () => void;
  onAddToCart: (perUnitAddOns: MenuProduct[][]) => void;
}) {
  // One add-on selection PER UNIT — bumping the quantity used to just
  // multiply a single shared selection, so "2x, one with Egg" was
  // impossible and the total silently assumed both units matched.
  // Each index here is its own unit's picks, kept separate from the rest.
  const [perUnitPicked, setPerUnitPicked] = useState<Set<number>[]>([new Set()]);
  const [activeUnit, setActiveUnit] = useState(0);
  const Icon = iconForCategory(product.category);
  const qty = perUnitPicked.length;

  function changeQty(delta: number) {
    if (delta > 0) {
      setPerUnitPicked((prev) => [...prev, new Set()]);
      return;
    }
    if (perUnitPicked.length <= 1) return;
    setPerUnitPicked((prev) => prev.slice(0, -1));
    // Removing always drops the last unit, so any tab pointing at it
    // (including that last one, if it was the active tab) falls back
    // to the new last unit instead of an index that no longer exists.
    setActiveUnit((i) => Math.min(i, perUnitPicked.length - 2));
  }

  function toggleAddOn(id: number) {
    setPerUnitPicked((prev) =>
      prev.map((picked, i) => {
        if (i !== activeUnit) return picked;
        const next = new Set(picked);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      })
    );
  }

  const perUnitAddOns = perUnitPicked.map((picked) => addOns.filter((a) => picked.has(a.id)));
  const chosenAddOns = perUnitAddOns[activeUnit] ?? [];
  const total = perUnitAddOns.reduce(
    (sum, unitAddOns) => sum + product.price + unitAddOns.reduce((s, a) => s + a.price, 0),
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal-900/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
       {/* Scrolls on its own so the Add to Cart button below stays
           visible however many add-ons there are. */}
       <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 sm:gap-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold leading-tight">
            {product.name.replace(/\s*\(Add-on\)\s*$/i, "")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-leaf-900/5 text-leaf-900 transition hover:bg-leaf-900/10"
          >
            <X size={18} />
          </button>
        </div>

        <span className="relative block aspect-[16/9] max-h-[28dvh] w-full shrink-0 overflow-hidden rounded-2xl bg-turmeric-500/15 text-leaf-900">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center">
              {/* iconForCategory returns a fixed module-level icon, so it is not recreated per render */}
              {/* eslint-disable-next-line react-hooks/static-components */}
              <Icon size={48} />
            </span>
          )}
        </span>

        <p className="big-number text-2xl text-leaf-900">₱{product.price}</p>

        {addOns.length > 0 && (
          <div>
            {qty > 1 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {perUnitAddOns.map((unitAddOns, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveUnit(i)}
                    className={
                      i === activeUnit
                        ? "flex min-h-[40px] items-center gap-1.5 rounded-full bg-leaf-900 px-3.5 text-xs font-extrabold uppercase tracking-wide text-rice-50"
                        : "flex min-h-[40px] items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-extrabold uppercase tracking-wide text-charcoal-900/70 transition hover:border-leaf-900"
                    }
                  >
                    Item {i + 1}
                    {unitAddOns.length > 0 && (
                      <span
                        aria-hidden
                        className={i === activeUnit ? "h-1.5 w-1.5 rounded-full bg-turmeric-500" : "h-1.5 w-1.5 rounded-full bg-leaf-900"}
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
            <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-charcoal-900/50">
              {qty > 1 ? `Add-Ons for Item ${activeUnit + 1} (optional)` : "Add-Ons (optional)"}
            </p>
            <div className="flex flex-col gap-2">
              {addOns.map((addOn) => {
                const active = chosenAddOns.some((a) => a.id === addOn.id);
                return (
                  <button
                    key={addOn.id}
                    type="button"
                    onClick={() => toggleAddOn(addOn.id)}
                    className={
                      active
                        ? "flex min-h-[56px] items-center justify-between rounded-xl border-2 border-leaf-900 bg-leaf-900/5 px-3.5 py-2 text-sm font-bold text-charcoal-900"
                        : "flex min-h-[56px] items-center justify-between rounded-xl border border-border px-3.5 py-2 text-sm font-bold text-charcoal-900/70 transition hover:border-leaf-900"
                    }
                  >
                    <span>{addOn.name.replace(/\s*\(Add-on\)\s*$/i, "")}</span>
                    <span>+₱{addOn.price}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-5 rounded-full border border-border py-2">
          <button
            type="button"
            onClick={() => changeQty(-1)}
            aria-label="Decrease quantity"
            className="flex h-11 w-11 items-center justify-center rounded-full text-leaf-900 transition hover:bg-leaf-900/10"
          >
            <Minus size={18} />
          </button>
          <span className="min-w-[20px] text-center text-lg font-bold">{qty}</span>
          <button
            type="button"
            onClick={() => changeQty(1)}
            aria-label="Increase quantity"
            className="flex h-11 w-11 items-center justify-center rounded-full text-leaf-900 transition hover:bg-leaf-900/10"
          >
            <Plus size={18} />
          </button>
        </div>

       </div>

       <div className="shrink-0 border-t border-border bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
        <button
          type="button"
          onClick={() => onAddToCart(perUnitAddOns)}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-turmeric-500 text-sm font-extrabold uppercase tracking-wide text-charcoal-900 shadow-brand transition hover:-translate-y-0.5"
        >
          <ShoppingCart size={18} /> Add to Cart · ₱{total.toFixed(0)}
        </button>
       </div>
      </div>
    </div>
  );
}

// A Combo Meal card — same footprint as a regular menu card, but shows
// what's bundled inside and a "Save ₱X" ribbon instead of Best Seller/New,
// and taps straight to cart (no add-ons picker — a combo's contents are
// fixed by Admin, not customizable at the kiosk).
function ComboCard({
  combo,
  inCart,
  justAdded,
  onTap,
  compact = false,
}: {
  combo: MenuCombo;
  inCart: number;
  justAdded: boolean;
  onTap: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!combo.inStock}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-1 hover:border-leaf-900 hover:shadow-brand disabled:pointer-events-none disabled:opacity-40 ${
        inCart > 0 ? "border-leaf-900 ring-2 ring-leaf-900/40" : "border-border"
      }`}
    >
      <span className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden bg-turmeric-500/15 text-leaf-900">
        {combo.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={combo.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center">
            <ShoppingCart size={38} />
          </span>
        )}
        {combo.savings > 0 && (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-achuete-600 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-md">
            Save ₱{combo.savings.toFixed(0)}
          </span>
        )}
        {inCart > 0 && (
          <span className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-leaf-900 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-rice-50 shadow-md">
            <ShoppingCart size={12} /> {compact ? `×${inCart}` : `${inCart} in cart`}
          </span>
        )}
        {!combo.inStock && (
          <span className="absolute inset-0 flex items-center justify-center bg-charcoal-900/50">
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-danger">
              Unavailable
            </span>
          </span>
        )}
        <span
          aria-hidden
          className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center transition group-hover:scale-110"
        >
          {justAdded ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/icons/icon-check.svg" alt="" className="h-11 w-11" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/icons/icon-plus.svg" alt="" className="h-11 w-11" />
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col gap-1 p-2">
        <p className={`text-sm font-bold leading-tight ${compact ? "line-clamp-2 break-words" : "truncate"}`}>{combo.name}</p>
        <p className={`text-[11px] font-semibold text-charcoal-900/50 ${compact ? "line-clamp-2" : "truncate"}`}>
          {combo.items.map((i) => (i.qty > 1 ? `${i.qty}x ${i.name}` : i.name)).join(" + ")}
        </p>
        <span className="flex items-baseline gap-1.5">
          <span className="big-number text-leaf-900">₱{combo.price}</span>
          {combo.savings > 0 && (
            <span className="text-xs font-semibold text-charcoal-900/40 line-through">
              ₱{combo.regularPrice.toFixed(0)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
