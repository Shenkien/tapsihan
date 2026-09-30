"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { recipeItemCost, unitLabel } from "@/lib/utils";
import type { AdminIngredient, AdminProduct, AdminRecipeItem } from "@/types/models";
import { fetchJson } from "@/lib/fetchJson";
import { roundPeso } from "@/lib/money";
import { actionBtn } from "@/components/admin/actionStyles";

type DraftRow = { ingredientId: number; qty: string };

const ALL_CATEGORIES = "__all__";

export default function RecipesTab() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [ingredients, setIngredients] = useState<AdminIngredient[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Collapsed by default — a category only opens once the user expands it,
  // or once a Menu Item inside it gets selected (so picking one from the
  // dropdown above always reveals it, instead of leaving it hidden).
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [coverageFilter, setCoverageFilter] = useState(ALL_CATEGORIES);
  const { toast } = useToast();

  async function load() {
    const [prodRes, ingRes] = await Promise.all([
      fetch("/api/admin/products"),
      fetch("/api/admin/ingredients"),
    ]);
    const prodData: AdminProduct[] = prodRes.ok ? await prodRes.json() : [];
    if (ingRes.ok) setIngredients(await ingRes.json());
    setProducts(prodData);
    setSelectedId((prev) => prev ?? prodData.find((p) => p.active)?.id ?? null);
  }

  useEffect(() => {
    load();
  }, []);

  const visibleProducts = useMemo(
    () =>
      (products ?? [])
        .filter((p) => p.active)
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [products]
  );

  const coverageCategories = useMemo(
    () => Array.from(new Set(visibleProducts.map((p) => p.category))).sort(),
    [visibleProducts]
  );

  const activeIngredients = useMemo(() => (ingredients ?? []).filter((i) => i.active), [ingredients]);
  const selectedProduct = visibleProducts.find((p) => p.id === selectedId) ?? null;

  function toggleCategory(category: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function selectProduct(product: AdminProduct) {
    setSelectedId(product.id);
    setExpandedCategories((prev) => new Set(prev).add(product.category));
  }

  if (!products || !ingredients) return <p className="opacity-60">Loading…</p>;

  if (activeIngredients.length === 0) {
    return (
      <p className="text-sm text-charcoal-900/50">
        Add some inventory items first in{" "}
        <a href="/admin/ingredients" className="font-semibold text-achuete-600">
          Inventory Items
        </a>{" "}
        before building a recipe.
      </p>
    );
  }

  if (visibleProducts.length === 0) {
    return (
      <p className="text-sm text-charcoal-900/50">
        No menu items need a recipe right now. Items marked &quot;sold as-is&quot; (like canned drinks) are
        hidden here — toggle &quot;Needs a Recipe&quot; back on for an item in{" "}
        <a href="/admin/menu" className="font-semibold text-achuete-600">
          Menu Items
        </a>{" "}
        if that&apos;s not right.
      </p>
    );
  }

  const withoutRecipeCount = visibleProducts.filter((p) => !p.recipeItemCount).length;

  return (
    <div className="flex flex-wrap items-start gap-10">
      <div className="flex w-full max-w-[280px] shrink-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-charcoal-900">Menu Item</label>
          <select
            value={selectedId ?? ""}
            onChange={(e) => {
              const product = visibleProducts.find((p) => p.id === Number(e.target.value));
              if (product) selectProduct(product);
            }}
            className="h-11 rounded-xl border border-border bg-white px-3 text-sm"
          >
            {visibleProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.category})
              </option>
            ))}
          </select>
        </div>

        {/* Coverage list — at a glance, which Menu Items already have a
            Recipe (inventory-tracked via Ingredients) vs. which still fall
            back to their own manual stock number. Click a row to jump the
            picker above straight to that item. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-charcoal-900">Recipe coverage</span>
            <span className="text-xs font-semibold text-charcoal-900/50">
              {withoutRecipeCount === 0
                ? "All set"
                : `${withoutRecipeCount} without a recipe`}
            </span>
          </div>
          <select
            value={coverageFilter}
            onChange={(e) => {
              setCoverageFilter(e.target.value);
              if (e.target.value !== ALL_CATEGORIES) {
                setExpandedCategories((prev) => new Set(prev).add(e.target.value));
              }
            }}
            className="h-9 rounded-xl border border-border bg-white px-3 text-xs font-semibold"
          >
            <option value={ALL_CATEGORIES}>All categories</option>
            {coverageCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="flex max-h-[480px] flex-col overflow-y-auto rounded-xl border border-border bg-white">
            {Object.entries(
              visibleProducts
                .filter((p) => coverageFilter === ALL_CATEGORIES || p.category === coverageFilter)
                .reduce<Record<string, AdminProduct[]>>((groups, p) => {
                  (groups[p.category] ??= []).push(p);
                  return groups;
                }, {})
            ).map(([category, items]) => {
              const isExpanded = expandedCategories.has(category);
              const coveredCount = items.filter((p) => !!p.recipeItemCount).length;
              return (
                <div key={category}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="sticky top-0 flex w-full items-center justify-between gap-2 bg-rice-50 px-3 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide text-charcoal-900/50 transition hover:bg-rice-100"
                  >
                    <span className="flex items-center gap-1.5">
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                      />
                      {category}
                    </span>
                    <span className="normal-case tracking-normal text-charcoal-900/40">
                      {coveredCount}/{items.length}
                    </span>
                  </button>
                  {isExpanded &&
                    items.map((p) => {
                      const hasRecipe = !!p.recipeItemCount;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectProduct(p)}
                          className={
                            "flex w-full items-center justify-between gap-2 border-t border-border px-3 py-2 text-left text-sm transition hover:bg-turmeric-500/10 " +
                            (p.id === selectedId ? "bg-turmeric-500/15 font-semibold" : "")
                          }
                        >
                          <span className="truncate">{p.name}</span>
                          {hasRecipe ? (
                            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#2b7a4b]">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {p.recipeItemCount}
                            </span>
                          ) : (
                            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-charcoal-900/40">
                              <AlertCircle className="h-3.5 w-3.5" />
                              None
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedProduct && (
        <RecipeEditor
          key={selectedProduct.id}
          product={selectedProduct}
          ingredients={activeIngredients}
          onSaved={() => {
            toast({ description: `Recipe saved for ${selectedProduct.name}.` });
            load();
          }}
        />
      )}
    </div>
  );
}

function RecipeEditor({
  product,
  ingredients,
  onSaved,
}: {
  product: AdminProduct;
  ingredients: AdminIngredient[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingCost, setSyncingCost] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // `cancelled` matters beyond the usual reason here: without it, clicking
    // through menu items faster than the requests resolve can land one item's
    // recipe rows in the editor for a different item — and saving from there
    // writes them to the wrong product.
    let cancelled = false;
    setRows(null);
    fetchJson<AdminRecipeItem[]>(`/api/admin/products/${product.id}/recipe`).then((items) => {
      if (cancelled) return;
      if (!items || !Array.isArray(items)) {
        // A failure response is still JSON (`{ error: ... }`), so the old
        // `.then((items) => items.map(...))` threw on it and blanked the tab.
        setRows([]);
        toast({
          title: "Could not load this recipe",
          description: "Try reloading the page — your session may have expired.",
          variant: "destructive",
        });
        return;
      }
      // Skip saved rows whose inventory item is no longer active/available —
      // they used to show up as a blank row (no cost, dropdown falling back
      // to the first option). Saving the recipe drops them for good.
      const known = new Set(ingredients.map((ing) => ing.id));
      setRows(
        items
          .filter((i) => known.has(i.ingredientId))
          .map((i) => ({ ingredientId: i.ingredientId, qty: String(i.qty) }))
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  function addRow() {
    setRows((prev) => {
      const current = prev ?? [];
      const usedIds = new Set(current.map((r) => r.ingredientId));
      // Default to the first ingredient NOT already in this recipe — every
      // row used to default to ingredients[0] no matter what, so clicking
      // "+ Add Inventory Item" a few times in a row (without touching each
      // new dropdown) silently built a recipe with the same ingredient
      // repeated several times. That's invalid — a recipe can only list an
      // ingredient once (see the unique constraint in schema.prisma) — but
      // nothing stopped it client-side, so it only surfaced as a crash on
      // Save (see handleSave below).
      const nextIngredient = ingredients.find((ing) => !usedIds.has(ing.id));
      // Every inventory item is already in this recipe — nothing left to add.
      if (!nextIngredient) return current;
      return [...current, { ingredientId: nextIngredient.id, qty: "1" }];
    });
  }

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setRows((prev) => (prev ?? []).map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setRows((prev) => (prev ?? []).filter((_, i) => i !== index));
  }

  async function handleSave() {
    if ((rows ?? []).some((r) => !(Number(r.qty) > 0))) {
      toast({
        title: "Could not save recipe",
        description: "Every ingredient row needs a quantity greater than 0. Fill it in or remove the row.",
        variant: "destructive",
      });
      return;
    }
    const items = (rows ?? [])
      .map((r) => ({ ingredientId: r.ingredientId, qty: Number(r.qty) }))
      .filter((r) => r.qty > 0);

    // Belt-and-suspenders: addRow() no longer defaults into a duplicate,
    // but a row can still be hand-edited into matching another one. Catch
    // that here instead of letting the PUT below hit the DB's unique
    // constraint and fail with no useful message.
    const duplicateIds = new Set<number>();
    const seenIds = new Set<number>();
    for (const item of items) {
      if (seenIds.has(item.ingredientId)) duplicateIds.add(item.ingredientId);
      seenIds.add(item.ingredientId);
    }
    if (duplicateIds.size > 0) {
      const names = ingredients
        .filter((ing) => duplicateIds.has(ing.id))
        .map((ing) => ing.name)
        .join(", ");
      toast({
        title: "Could not save recipe",
        description: `${names} appears more than once — each inventory item can only be listed once per recipe. Remove the duplicate row(s) or combine their quantities.`,
        variant: "destructive",
      });
      return;
    }

    if (sellsAtALoss) {
      toast({
        title: "Heads up: this recipe costs more than the price",
        description: `₱${totalCost.toFixed(2)} per serving vs. a ₱${product.price.toFixed(
          2
        )} selling price — the store loses ₱${lossPerServing.toFixed(2)} on every order of ${product.name}.`,
        variant: "destructive",
      });
    }

    setSaving(true);
    const res = await fetch(`/api/admin/products/${product.id}/recipe`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setSaving(false);
    if (!res.ok) {
      // The failure response is usually JSON (`{ error: ... }`), but an
      // unhandled exception on the server (a DB constraint violation, a
      // dropped connection) can come back with an empty or non-JSON body —
      // res.json() throws on that instead of resolving, which used to take
      // the whole page down instead of just showing a toast.
      let message = `Request failed (${res.status})`;
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        // no JSON body — fall back to the generic message above
      }
      toast({ title: "Could not save recipe", description: message, variant: "destructive" });
      return;
    }
    onSaved();
  }

  if (!rows) return <p className="opacity-60">Loading recipe…</p>;

  // Stock-availability and cost are both derived client-side from the full
  // ingredient list (which carries stock/pieceStock/cost/piecesPerUnit),
  // not the recipe response's trimmed ingredient object. An ingredient's
  // `cost` is whatever was paid per bulk purchase unit on a Purchase Order
  // (per kg, per L, per piece...); `recipeItemCost` converts that down to
  // this row's qty, accounting for piece-tracked ingredients via
  // `piecesPerUnit`. This is only as accurate as those two numbers are kept
  // — see the cost panel below for how it rolls up into a per-serving total.
  const parsedRows = rows.map((r) => ({
    ...r,
    ingredient: ingredients.find((ing) => ing.id === r.ingredientId),
    qtyNum: Number(r.qty) || 0,
  }));
  const shortIngredients = parsedRows.filter((r) => {
    if (!r.ingredient) return false;
    const available = r.ingredient.trackByPiece ? r.ingredient.pieceStock : r.ingredient.stock;
    return available < r.qtyNum;
  });
  const totalCost = parsedRows.reduce(
    (sum, r) => (r.ingredient ? sum + recipeItemCost(r.ingredient, r.qtyNum) : sum),
    0
  );
  const costIsCurrent = rows.length > 0 && Math.abs(totalCost - product.cost) < 0.005;
  // Selling below cost means every order of this item loses the store
  // money — worth a loud, unmissable warning right where the cost is set,
  // not just a quiet number someone has to notice is "too high" on their
  // own.
  const lossPerServing = totalCost - product.price;
  const sellsAtALoss = rows.length > 0 && lossPerServing > 0.005;

  async function syncCostToMenuItem() {
    if (sellsAtALoss) {
      toast({
        title: "Heads up: this recipe costs more than the price",
        description: `Setting the cost to ₱${totalCost.toFixed(2)} means ${product.name} sells at a ₱${lossPerServing.toFixed(
          2
        )} loss per order (price is ₱${product.price.toFixed(2)}).`,
        variant: "destructive",
      });
    }
    setSyncingCost(true);
    const res = await fetch(`/api/admin/products/${product.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cost: roundPeso(totalCost) }),
    });
    setSyncingCost(false);
    if (!res.ok) {
      const data = await res.json();
      toast({ title: "Could not update cost", description: data.error, variant: "destructive" });
      return;
    }
    toast({ description: `${product.name}'s cost is now ₱${totalCost.toFixed(2)}.` });
    onSaved();
  }

  return (
    <div className="flex min-w-[280px] flex-1 flex-col gap-3">
      {rows.length === 0 && (
        <p className="text-sm text-charcoal-900/50">
          No ingredients linked yet — this item still uses its own manual stock number.
        </p>
      )}
      {rows.map((row, i) => {
        const ingredient = ingredients.find((ing) => ing.id === row.ingredientId);
        const qtyNum = Number(row.qty) || 0;
        return (
          <div key={i} className="flex items-center gap-2">
            <select
              value={row.ingredientId}
              onChange={(e) => updateRow(i, { ingredientId: Number(e.target.value) })}
              className="h-11 flex-1 rounded-xl border border-border bg-white px-3 text-sm"
            >
              {Object.entries(
                ingredients.reduce<Record<string, AdminIngredient[]>>((groups, ing) => {
                  // Skip items already used by another row (keep this row's own
                  // pick) so the same inventory item can't be added twice.
                  const usedElsewhere = rows.some((r, idx) => idx !== i && r.ingredientId === ing.id);
                  if (usedElsewhere) return groups;
                  (groups[ing.category] ??= []).push(ing);
                  return groups;
                }, {})
              )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([cat, ings]) => (
                  <optgroup key={cat} label={cat}>
                    {ings.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({ing.trackByPiece ? ing.pieceUnitLabel : unitLabel(ing.unit)})
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
            <Input
              type="number"
              min={0}
              step="any"
              value={row.qty}
              onChange={(e) => updateRow(i, { qty: e.target.value })}
              className="w-24"
              placeholder="Qty"
            />
            {!ingredient?.trackByPiece && (
              <span className="w-10 shrink-0 text-xs font-semibold text-charcoal-900/50">
                {ingredient ? unitLabel(ingredient.unit) : ""}
              </span>
            )}
            <span className="w-16 shrink-0 text-right text-xs font-semibold text-charcoal-900/50">
              {ingredient ? `₱${recipeItemCost(ingredient, qtyNum).toFixed(2)}` : ""}
            </span>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className={actionBtn("delete")}
              aria-label="Remove ingredient"
              title="Remove ingredient"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit gap-1.5 border-dashed"
        onClick={addRow}
        disabled={ingredients.every((ing) => rows.some((r) => r.ingredientId === ing.id))}
      >
        <Plus className="h-4 w-4" /> Add Inventory Item
      </Button>

      <div className="mt-1 flex flex-wrap items-center gap-4 text-sm">
        {rows.length > 0 &&
          (shortIngredients.length === 0 ? (
            <span className="flex items-center gap-1.5 font-semibold text-[#2b7a4b]">
              <CheckCircle2 className="h-4 w-4" /> All inventory items in stock
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-semibold text-danger">
              <AlertCircle className="h-4 w-4" /> Short on {shortIngredients.length} inventory item
              {shortIngredients.length === 1 ? "" : "s"}
            </span>
          ))}
      </div>

      {sellsAtALoss && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-[#fbe4e1] px-4 py-3 text-sm font-semibold text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This recipe costs ₱{totalCost.toFixed(2)} per serving but {product.name} sells for only ₱
            {product.price.toFixed(2)} — the store loses ₱{lossPerServing.toFixed(2)} on every one sold. Raise
            the price or reduce the recipe&apos;s ingredient quantities before saving.
          </span>
        </div>
      )}

      {rows.length > 0 && (
        <div
          className={`mt-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
            sellsAtALoss ? "border-danger bg-[#fbe4e1]" : "border-dashed border-border bg-rice-50"
          }`}
        >
          <div className="flex flex-col">
            <span
              className={`text-xs font-semibold uppercase tracking-wide ${
                sellsAtALoss ? "text-danger" : "text-charcoal-900/50"
              }`}
            >
              Cost per serving (from this recipe)
            </span>
            <span className={`text-lg font-extrabold ${sellsAtALoss ? "text-danger" : "text-charcoal-900"}`}>
              ₱{totalCost.toFixed(2)}
            </span>
            <span className={`text-xs ${sellsAtALoss ? "text-danger/80" : "text-charcoal-900/50"}`}>
              {product.name}&apos;s saved cost is currently ₱{product.cost.toFixed(2)}
              {costIsCurrent ? " — up to date." : " — out of sync with this recipe."}
            </span>
            {sellsAtALoss && (
              <span className="text-xs font-bold text-danger">Selling price is only ₱{product.price.toFixed(2)}.</span>
            )}
          </div>
          <Button
            type="button"
            variant={costIsCurrent ? "ghost" : "primary"}
            size="sm"
            disabled={syncingCost || costIsCurrent}
            onClick={syncCostToMenuItem}
          >
            {syncingCost ? "Updating…" : costIsCurrent ? "Cost is up to date" : `Set item cost to ₱${totalCost.toFixed(2)}`}
          </Button>
        </div>
      )}

      <Button type="button" size="sm" className="mt-2 w-fit" disabled={saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save Recipe"}
      </Button>
    </div>
  );
}
