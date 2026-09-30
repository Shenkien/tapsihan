"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowUpCircle, ArrowDownCircle, Check, History as HistoryIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { moneyError, nameError } from "@/lib/formRules";
import { useRowFlash } from "@/hooks/useRowFlash";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { unitLabel, ingredientUnitCost } from "@/lib/utils";
import type { AdminIngredient, AdminIngredientLog, AdminCategory, AdminSupplier, AdminUnitOfMeasure } from "@/types/models";
import { actionBtn } from "@/components/admin/actionStyles";

const ALL_CATEGORIES = "__all__";

// Manual + / − Stock Actions apply straight away with a fixed logged reason
// (no "why?" step): adding stock is logged as a restock, removing as a correction.
const ADD_REASON = "RESTOCK" as const;
const REMOVE_REASON = "ADJUSTMENT" as const;

const REASON_LABEL: Record<AdminIngredientLog["reason"], string> = {
  RESTOCK: "Restock",
  ADJUSTMENT: "Correction",
  WASTE: "Waste",
  SALE: "Sale",
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

type Panel = { id: number; mode: "history" };

export default function IngredientsTab() {
  const [ingredients, setIngredients] = useState<AdminIngredient[] | null>(null);
  // Maintained pick-lists from Admin > Maintenance > Categories / Units of
  // Measure — this is what feeds the Add Item form's dropdowns below.
  const [ingredientCategories, setIngredientCategories] = useState<AdminCategory[]>([]);
  const [units, setUnits] = useState<AdminUnitOfMeasure[]>([]);
  const [qtyDrafts, setQtyDrafts] = useState<Record<number, string>>({});
  const [suppliers, setSuppliers] = useState<AdminSupplier[]>([]);
  // The stock-history panel open under a row (one at a time).
  const [panel, setPanel] = useState<Panel | null>(null);
  const [historyLogs, setHistoryLogs] = useState<AdminIngredientLog[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  // One combined editor per row (opened via the pencil icon) instead of
  // separate always-visible controls for name/category/piece-tracking —
  // everything about how an item is configured lives in one place, and the
  // default table view only shows the numbers someone checks day to day.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: "",
    category: "",
    cost: "",
    lowStockThreshold: "",
    trackByPiece: false,
    piecesPerUnit: "1",
    pieceUnitLabel: "pcs",
    supplierId: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const { flash, flashClass } = useRowFlash();
  const { toast } = useToast();

  async function load() {
    const [ingRes, catRes, unitRes, supRes] = await Promise.all([
      fetch("/api/admin/ingredients"),
      fetch("/api/admin/categories?type=INGREDIENT"),
      fetch("/api/admin/units"),
      fetch("/api/admin/suppliers"),
    ]);
    if (ingRes.ok) setIngredients(await ingRes.json());
    if (supRes.ok) setSuppliers(await supRes.json());
    if (catRes.ok) setIngredientCategories(await catRes.json());
    if (unitRes.ok) setUnits(await unitRes.json());
  }

  useEffect(() => {
    load();
  }, []);

  const visibleIngredients = useMemo(
    () => (ingredients ?? []).filter((i) => i.active).sort((a, b) => a.name.localeCompare(b.name)),
    [ingredients]
  );

  const categories = useMemo(
    () => Array.from(new Set(visibleIngredients.map((i) => i.category))).sort(),
    [visibleIngredients]
  );

  const filteredIngredients = useMemo(
    () =>
      categoryFilter === ALL_CATEGORIES
        ? visibleIngredients
        : visibleIngredients.filter((i) => i.category === categoryFilter),
    [visibleIngredients, categoryFilter]
  );

  // Stock on hand × cost, in the unit recipes use (pieces for a piece-tracked
  // item, otherwise the purchase unit). Derived — nothing is stored.
  function stockValue(i: AdminIngredient) {
    return (i.trackByPiece ? i.pieceStock : i.stock) * ingredientUnitCost(i);
  }
  const totalValue = useMemo(
    () => filteredIngredients.reduce((sum, i) => sum + stockValue(i), 0),
    [filteredIngredients]
  );

  function draftQty(key: number) {
    const raw = Number(qtyDrafts[key]);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }

  // Stock Action always moves the pool that's actually consumed by orders:
  // pieceStock for a piece-tracked ingredient (Bangus, sold as 1 fish per
  // order), or the regular weight/base stock for everything else. The kg
  // side of a piece-tracked ingredient is left alone here — it only moves
  // when a Purchase Order is received.
  async function adjustIngredient(
    ingredient: AdminIngredient,
    direction: 1 | -1,
    reason: "RESTOCK" | "ADJUSTMENT" | "WASTE",
    note: string
  ) {
    const qty = draftQty(ingredient.id);
    if (!qty) {
      toast({ title: "Enter a quantity first", variant: "destructive" });
      return false;
    }
    const res = await fetch(`/api/admin/ingredients/${ingredient.id}/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        change: direction * qty,
        reason,
        target: ingredient.trackByPiece ? "pieceStock" : "stock",
        ...(note ? { note } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: "Could not update stock", description: data.error, variant: "destructive" });
      return false;
    }
    setQtyDrafts((prev) => ({ ...prev, [ingredient.id]: "" }));
    await load();
    flash(ingredient.id);
    return true;
  }

  // + / − apply the typed quantity immediately, no reason prompt.
  async function quickAdjust(ingredient: AdminIngredient, direction: 1 | -1) {
    await adjustIngredient(ingredient, direction, direction === 1 ? ADD_REASON : REMOVE_REASON, "");
  }

  async function toggleHistory(ingredient: AdminIngredient) {
    if (panel?.id === ingredient.id && panel.mode === "history") {
      setPanel(null);
      return;
    }
    setPanel({ id: ingredient.id, mode: "history" });
    setHistoryLogs(null);
    const res = await fetch(`/api/admin/ingredients/${ingredient.id}/history`);
    setHistoryLogs(res.ok ? await res.json() : []);
  }

  async function removeIngredient(ingredient: AdminIngredient) {
    if (!confirm(`Remove "${ingredient.name}" from Inventory?`)) return;
    const res = await fetch(`/api/admin/ingredients/${ingredient.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast({ title: "Could not remove item", description: data.error, variant: "destructive" });
      return;
    }
    toast({ description: `${ingredient.name} removed.` });
    load();
  }

  // Cost is shown and edited in whatever unit a Recipe actually uses this
  // ingredient by (a piece/cup for a piece-tracked item, its bulk purchase
  // unit otherwise) — matching what Admin > Recipes already shows per row —
  // rather than making someone mentally divide back to a per-piece price.
  function openEditor(ingredient: AdminIngredient) {
    setEditDraft({
      name: ingredient.name,
      category: ingredient.category,
      cost: ingredientUnitCost(ingredient).toFixed(2),
      lowStockThreshold: String(ingredient.lowStockThreshold),
      trackByPiece: ingredient.trackByPiece,
      piecesPerUnit: String(ingredient.piecesPerUnit || 1),
      pieceUnitLabel: ingredient.pieceUnitLabel || "pcs",
      supplierId: String(ingredient.supplierId ?? ""),
    });
    setEditingId(ingredient.id);
  }

  async function saveEdit(ingredient: AdminIngredient) {
    const name = editDraft.name.trim();
    const category = editDraft.category.trim();
    const enteredCost = Number(editDraft.cost);
    const piecesPerUnit = Number(editDraft.piecesPerUnit);
    const pieceUnitLabel = editDraft.pieceUnitLabel.trim();
    const lowStockThreshold = Number(editDraft.lowStockThreshold);
    if (!name) {
      toast({ title: "Name can't be empty", variant: "destructive" });
      return;
    }
    if (!category) {
      toast({ title: "Pick a category", variant: "destructive" });
      return;
    }
    if (editDraft.cost.trim() === "" || !Number.isFinite(enteredCost) || enteredCost < 0) {
      toast({ title: "Enter a valid cost", variant: "destructive" });
      return;
    }
    if (editDraft.lowStockThreshold.trim() === "" || !Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
      toast({ title: "Enter a reorder level", variant: "destructive" });
      return;
    }
    if (editDraft.trackByPiece && (!Number.isFinite(piecesPerUnit) || piecesPerUnit <= 0 || !pieceUnitLabel)) {
      toast({ title: "Enter a yield greater than 0 and a label (e.g. pcs, cups)", variant: "destructive" });
      return;
    }
    // The entered cost is per recipe-unit (piece/cup), so convert it back to
    // the per-bulk-unit number the database actually stores before saving.
    const cost = editDraft.trackByPiece ? enteredCost * piecesPerUnit : enteredCost;
    setSavingEdit(true);
    const res = await fetch(`/api/admin/ingredients/${ingredient.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        category: category || "Uncategorized",
        cost,
        lowStockThreshold: Number.isFinite(lowStockThreshold) ? lowStockThreshold : undefined,
        trackByPiece: editDraft.trackByPiece,
        ...(editDraft.trackByPiece ? { piecesPerUnit, pieceUnitLabel } : {}),
        supplierId: editDraft.supplierId ? Number(editDraft.supplierId) : null,
      }),
    });
    const data = await res.json();
    setSavingEdit(false);
    if (!res.ok) {
      toast({ title: "Could not save changes", description: data.error, variant: "destructive" });
      return;
    }
    setEditingId(null);
    await load();
    flash(ingredient.id);
  }

  if (!ingredients) return <p className="opacity-60">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold"
        >
          <option value={ALL_CATEGORIES}>All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="text-sm text-charcoal-900/60">
          Stock value{categoryFilter === ALL_CATEGORIES ? "" : " (shown)"}:{" "}
          <span className="font-bold text-charcoal-900">₱{totalValue.toFixed(2)}</span>
        </p>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAddForm((v) => !v)}>
          <Plus className="h-4 w-4" /> Add Item
        </Button>
      </div>

      {showAddForm && (
        <AddIngredientForm
          categories={ingredientCategories}
          units={units}
          suppliers={suppliers}
          onCreated={() => {
            setShowAddForm(false);
            load();
          }}
        />
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
        <table className="w-full min-w-[1120px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-extrabold uppercase tracking-wide text-charcoal-900/40">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Usual supplier</th>
              <th className="px-4 py-3">Cost</th>
              <th className="px-4 py-3">On hand</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Reorder at</th>
              <th className="px-4 py-3">Stock action</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredIngredients.map((i) => {
              // lowStockThreshold is entered in the purchase unit, so for a
              // trackByPiece item it must be converted to pieces before
              // comparing against pieceStock — see the matching fix in
              // /api/admin/dashboard.
              const low = i.trackByPiece
                ? i.pieceStock < i.lowStockThreshold * (i.piecesPerUnit || 1)
                : i.stock < i.lowStockThreshold;
              const isEditing = editingId === i.id;
              return (
                <Fragment key={i.id}>
                <tr
                  className={`border-b border-border transition-colors last:border-b-0 ${
                    isEditing ? "bg-sky-50" : low ? "bg-red-50 hover:bg-red-100" : "hover:bg-rice-50"
                  } ${flashClass(i.id)}`}
                >
                  <td className="px-4 py-3 font-semibold">
                    {isEditing ? (
                      <Input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                        aria-invalid={editDraft.name.trim() === ""}
                        className="h-9 min-h-0 min-w-[140px]"
                      />
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          {i.name}
                          {low && (
                            <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                              Low
                            </span>
                          )}
                        </span>
                        {i.lastPurchase && (
                          <span className="text-[11px] font-normal text-charcoal-900/45">
                            Last bought {shortDate(i.lastPurchase.date)} · ₱{i.lastPurchase.unitCost.toFixed(2)}/
                            {unitLabel(i.unit)} · {i.lastPurchase.supplierName}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-charcoal-900/60">
                    {isEditing ? (
                      ingredientCategories.length > 0 ? (
                        <select
                          value={editDraft.category}
                          onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
                          className="h-9 rounded-lg border border-border bg-white px-2 text-sm"
                        >
                          {ingredientCategories
                            .filter((c) => c.active || c.name === editDraft.category)
                            .map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <Input
                          value={editDraft.category}
                          onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
                          className="h-9 min-h-0 min-w-[120px]"
                        />
                      )
                    ) : (
                      i.category
                    )}
                  </td>
                  <td className="px-4 py-3 text-charcoal-900/60">
                    {isEditing ? (
                      <select
                        value={editDraft.supplierId}
                        onChange={(e) => setEditDraft((d) => ({ ...d, supplierId: e.target.value }))}
                        className="h-9 rounded-lg border border-border bg-white px-2 text-sm"
                      >
                        <option value="">None</option>
                        {suppliers.map((sup) => (
                          <option key={sup.id} value={sup.id}>
                            {sup.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      i.supplier?.name ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-charcoal-900/50">₱</span>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={editDraft.cost}
                          onChange={(e) => setEditDraft((d) => ({ ...d, cost: e.target.value }))}
                          className="h-9 w-20 min-h-0"
                        />
                        <span className="text-xs text-charcoal-900/50">
                          / {editDraft.trackByPiece ? editDraft.pieceUnitLabel || "pc" : unitLabel(i.unit)}
                        </span>
                      </div>
                    ) : (
                      <span className="font-semibold">
                        ₱{ingredientUnitCost(i).toFixed(2)}
                        <span className="ml-1 font-normal text-charcoal-900/50">
                          / {i.trackByPiece ? i.pieceUnitLabel : unitLabel(i.unit)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-charcoal-900/70">
                          <input
                            type="checkbox"
                            checked={editDraft.trackByPiece}
                            onChange={(e) => setEditDraft((d) => ({ ...d, trackByPiece: e.target.checked }))}
                            className="h-3.5 w-3.5"
                          />
                          Track by piece
                        </label>
                        {editDraft.trackByPiece && (
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-charcoal-900/50">1 {unitLabel(i.unit)} =</span>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={editDraft.piecesPerUnit}
                              onChange={(e) => setEditDraft((d) => ({ ...d, piecesPerUnit: e.target.value }))}
                              className="h-8 w-14 min-h-0"
                            />
                            <Input
                              value={editDraft.pieceUnitLabel}
                              onChange={(e) => setEditDraft((d) => ({ ...d, pieceUnitLabel: e.target.value }))}
                              placeholder="pcs, cups…"
                              className="h-8 w-16 min-h-0"
                            />
                          </div>
                        )}
                      </div>
                    ) : i.trackByPiece ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={low ? "font-bold text-danger" : "font-bold"}>
                          {i.pieceStock} {i.pieceUnitLabel}
                        </span>
                        <span className="text-[11px] text-charcoal-900/40">
                          from {i.stock} {unitLabel(i.unit)} received
                        </span>
                      </div>
                    ) : (
                      <span className={low ? "font-bold text-danger" : "font-bold"}>
                        {i.stock} {unitLabel(i.unit)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-charcoal-900/60">₱{stockValue(i).toFixed(2)}</td>
                  <td className="px-4 py-3 text-charcoal-900/60">
                    {isEditing ? (
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={editDraft.lowStockThreshold}
                        onChange={(e) => setEditDraft((d) => ({ ...d, lowStockThreshold: e.target.value }))}
                        className="h-9 w-16 min-h-0"
                      />
                    ) : (
                      <>
                        {i.lowStockThreshold} {unitLabel(i.unit)}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        placeholder={i.trackByPiece ? i.pieceUnitLabel : "Qty"}
                        className="h-9 w-20 min-h-0"
                        value={qtyDrafts[i.id] ?? ""}
                        onChange={(e) => setQtyDrafts((prev) => ({ ...prev, [i.id]: e.target.value }))}
                      />
                      <button
                        onClick={() => quickAdjust(i, 1)}
                        className={actionBtn("restock", "p-1.5")}
                        title={i.trackByPiece ? `Add ${i.pieceUnitLabel} manually` : "Restock"}
                      >
                        <ArrowUpCircle className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => quickAdjust(i, -1)}
                        className={actionBtn("deduct", "p-1.5")}
                        title={i.trackByPiece ? `Remove ${i.pieceUnitLabel} manually (waste, recount)` : "Deduct (waste/adjustment)"}
                      >
                        <ArrowDownCircle className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => saveEdit(i)}
                          disabled={savingEdit}
                          className={actionBtn("save", "p-1.5")}
                          title="Save changes"
                        >
                          <Check className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          disabled={savingEdit}
                          className={actionBtn("cancel", "p-1.5")}
                          title="Cancel"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => toggleHistory(i)}
                          className={actionBtn(panel?.id === i.id && panel.mode === "history" ? "edit" : "cancel", "p-1.5")}
                          title="Stock history — every restock, sale, waste and correction"
                        >
                          <HistoryIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => openEditor(i)}
                          className={actionBtn("edit", "p-1.5")}
                          title="Edit item, cost, and piece-tracking"
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => removeIngredient(i)}
                          className={actionBtn("delete", "p-1.5")}
                          title="Remove item"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {panel?.id === i.id && panel.mode === "history" && (
                  <tr className="border-b border-border bg-rice-50">
                    <td colSpan={9} className="px-4 py-3">
                      {historyLogs === null ? (
                        <p className="text-sm text-charcoal-900/50">Loading history…</p>
                      ) : historyLogs.length === 0 ? (
                        <p className="text-sm text-charcoal-900/50">No stock movement recorded for {i.name} yet.</p>
                      ) : (
                        <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                          <p className="text-xs font-bold uppercase tracking-wide text-charcoal-900/50">
                            Stock history{historyLogs.length >= 100 ? " (latest 100)" : ""}
                          </p>
                          {historyLogs.map((log) => (
                            <div key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl bg-white px-3 py-1.5 text-sm">
                              <span className="w-28 shrink-0 text-xs text-charcoal-900/50">
                                {new Date(log.createdAt).toLocaleString("en-PH", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span className={`w-24 shrink-0 font-bold ${log.change < 0 ? "text-danger" : "text-emerald-700"}`}>
                                {log.change > 0 ? "+" : ""}
                                {Number(log.change.toFixed(3))}{" "}
                                {log.target === "pieceStock" ? i.pieceUnitLabel : unitLabel(i.unit)}
                              </span>
                              <span className="rounded-full bg-rice-100 px-2 py-0.5 text-xs font-bold text-charcoal-900/60">
                                {REASON_LABEL[log.reason]}
                              </span>
                              {log.note && <span className="text-charcoal-900/70">{log.note}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {filteredIngredients.length === 0 && (
          <p className="px-4 py-6 text-sm text-charcoal-900/50">
            {ingredients.length === 0
              ? "No items yet — add one above, or receive a Purchase Order."
              : "Nothing in this category."}
          </p>
        )}
      </div>
    </div>
  );
}

function AddIngredientForm({
  categories,
  units,
  suppliers,
  onCreated,
}: {
  categories: AdminCategory[];
  units: AdminUnitOfMeasure[];
  suppliers: AdminSupplier[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const activeCategories = useMemo(() => categories.filter((c) => c.active), [categories]);
  const activeUnits = useMemo(() => units.filter((u) => u.active), [units]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [stock, setStock] = useState("");
  const [cost, setCost] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [trackByPiece, setTrackByPiece] = useState(false);
  const [pieceStock, setPieceStock] = useState("");
  // Once the person types into Starting count directly, stop overwriting it —
  // only auto-fill while it's still following Starting stock × yield.
  const [pieceStockTouched, setPieceStockTouched] = useState(false);
  const [piecesPerUnit, setPiecesPerUnit] = useState("1");
  const [pieceUnitLabel, setPieceUnitLabel] = useState("pcs");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function clearError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  useEffect(() => {
    if (!category && activeCategories.length > 0) setCategory(activeCategories[0].name);
  }, [activeCategories, category]);

  useEffect(() => {
    if (!unit && activeUnits.length > 0) setUnit(activeUnits[0].abbreviation);
  }, [activeUnits, unit]);

  // Auto-calculate Starting count = Starting stock × 1-unit yield, e.g. 3 kg
  // of Bangus at 3 pcs/kg = 9 pcs, so the person doesn't have to do the math.
  useEffect(() => {
    if (!trackByPiece || pieceStockTouched) return;
    const stockNum = Number(stock);
    const yieldNum = Number(piecesPerUnit);
    if (!Number.isFinite(stockNum) || !Number.isFinite(yieldNum) || stock === "" || piecesPerUnit === "") {
      setPieceStock("");
      return;
    }
    const computed = stockNum * yieldNum;
    setPieceStock(computed ? String(computed) : "");
  }, [trackByPiece, stock, piecesPerUnit, pieceStockTouched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const nameProblem = nameError(name, "Item name");
    if (nameProblem) next.name = nameProblem;
    if (!category) next.category = "Add a Category under Maintenance first";
    if (!unit) next.unit = "Add a Unit under Maintenance first";
    const stockProblem = moneyError(stock, "Starting stock", { required: true, max: 1_000_000 });
    if (stockProblem) next.stock = stockProblem;
    const costProblem = moneyError(cost, "Cost", { required: true, max: 1_000_000 });
    if (costProblem) next.cost = costProblem;
    const reorderProblem = moneyError(lowStockThreshold, "Reorder level", { required: true, max: 1_000_000 });
    if (reorderProblem) next.lowStockThreshold = reorderProblem;
    if (trackByPiece) {
      if (!(Number(piecesPerUnit) > 0)) next.piecesPerUnit = "Enter a yield greater than 0";
      const labelProblem = nameError(pieceUnitLabel, "Label", 40);
      if (labelProblem) next.pieceUnitLabel = labelProblem;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast({ title: "Please fix the highlighted fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        category,
        unit,
        stock: Number(stock),
        cost: Number(cost),
        lowStockThreshold: Number(lowStockThreshold),
        supplierId: supplierId ? Number(supplierId) : null,
        trackByPiece,
        pieceStock: trackByPiece ? Number(pieceStock) || 0 : undefined,
        piecesPerUnit: trackByPiece ? Number(piecesPerUnit) || 1 : undefined,
        pieceUnitLabel: trackByPiece ? pieceUnitLabel.trim() || "pcs" : undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Could not add item", description: data.error, variant: "destructive" });
      return;
    }
    toast({ description: `${name.trim()} added.` });
    setName("");
    setCategory("");
    setStock("");
    setCost("");
    setLowStockThreshold("");
    setSupplierId("");
    setTrackByPiece(false);
    setPieceStock("");
    setPieceStockTouched(false);
    setPiecesPerUnit("1");
    setPieceUnitLabel("pcs");
    setErrors({});
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-[160px] flex-1 flex-col gap-1">
          <Label htmlFor="ing-name" required filled={!errors.name && name.trim().length > 0} className="text-xs text-charcoal-900/60">
            Name
          </Label>
          <Input
            id="ing-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError("name");
            }}
            aria-invalid={Boolean(errors.name)}
            placeholder="e.g. Bangus"
          />
          <FieldError message={errors.name} />
        </div>
        <div className="flex min-w-[160px] flex-col gap-1">
          <Label htmlFor="ing-category" required filled={Boolean(category)} className="text-xs text-charcoal-900/60">
            Category
          </Label>
          {activeCategories.length > 0 ? (
            <select
              id="ing-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold focus-visible:border-achuete-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-achuete-600/30"
            >
              {activeCategories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <a href="/admin/categories" className="text-xs font-semibold text-achuete-600 underline">
              Add an Inventory Item category in Maintenance first →
            </a>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ing-unit" required filled={Boolean(unit)} className="text-xs text-charcoal-900/60">
            Unit
          </Label>
          {activeUnits.length > 0 ? (
            <select
              id="ing-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold focus-visible:border-achuete-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-achuete-600/30"
            >
              {activeUnits.map((u) => (
                <option key={u.id} value={u.abbreviation}>
                  {unitLabel(u.abbreviation)}
                </option>
              ))}
            </select>
          ) : (
            <a href="/admin/units" className="text-xs font-semibold text-achuete-600 underline">
              Add a Unit of Measure in Maintenance first →
            </a>
          )}
        </div>
        <div className="flex min-w-[160px] flex-col gap-1">
          <Label htmlFor="ing-supplier" className="text-xs text-charcoal-900/60">
            Usual supplier <span className="font-normal text-charcoal-900/40">optional</span>
          </Label>
          <select
            id="ing-supplier"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold focus-visible:border-achuete-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-achuete-600/30"
          >
            <option value="">None</option>
            {suppliers.map((sup) => (
              <option key={sup.id} value={sup.id}>
                {sup.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-28 flex-col gap-1">
          <Label htmlFor="ing-stock" required filled={!errors.stock && stock.trim() !== ""} className="text-xs text-charcoal-900/60">
            Starting stock
          </Label>
          <Input
            id="ing-stock"
            type="number"
            min={0}
            step="any"
            value={stock}
            onChange={(e) => {
              setStock(e.target.value);
              clearError("stock");
            }}
            aria-invalid={Boolean(errors.stock)}
            placeholder="0"
          />
          <FieldError message={errors.stock} />
        </div>
        <div className="flex w-32 flex-col gap-1">
          <Label htmlFor="ing-cost" required filled={!errors.cost && cost.trim() !== ""} className="text-xs text-charcoal-900/60">
            Cost per {unitLabel(unit) || "unit"}
          </Label>
          <Input
            id="ing-cost"
            type="number"
            min={0}
            step="0.01"
            value={cost}
            onChange={(e) => {
              setCost(e.target.value);
              clearError("cost");
            }}
            aria-invalid={Boolean(errors.cost)}
            placeholder="0.00"
          />
          <FieldError message={errors.cost} />
        </div>
        <div className="flex w-28 flex-col gap-1">
          <Label htmlFor="ing-reorder" required filled={!errors.lowStockThreshold && lowStockThreshold.trim() !== ""} className="text-xs text-charcoal-900/60">
            Reorder at
          </Label>
          <Input
            id="ing-reorder"
            type="number"
            min={0}
            step="any"
            value={lowStockThreshold}
            onChange={(e) => {
              setLowStockThreshold(e.target.value);
              clearError("lowStockThreshold");
            }}
            aria-invalid={Boolean(errors.lowStockThreshold)}
            placeholder="5"
          />
          <FieldError message={errors.lowStockThreshold} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={trackByPiece}
          onChange={(e) => setTrackByPiece(e.target.checked)}
          className="h-4 w-4"
        />
        Track by piece (bought by weight, used per piece or serving — e.g. whole fish, cups of rice)
      </label>

      {trackByPiece && (
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex w-24 flex-col gap-1">
            <Label htmlFor="ing-yield" required filled={!errors.piecesPerUnit && Number(piecesPerUnit) > 0} className="text-xs text-charcoal-900/60">
              1 {unitLabel(unit)} yields
            </Label>
            <Input
              id="ing-yield"
              type="number"
              min={0}
              step="any"
              value={piecesPerUnit}
              onChange={(e) => {
                setPiecesPerUnit(e.target.value);
                clearError("piecesPerUnit");
              }}
              aria-invalid={Boolean(errors.piecesPerUnit)}
              placeholder="5"
            />
            <FieldError message={errors.piecesPerUnit} />
          </div>
          <div className="flex w-28 flex-col gap-1">
            <Label htmlFor="ing-label" required filled={!errors.pieceUnitLabel && pieceUnitLabel.trim().length > 0} className="text-xs text-charcoal-900/60">
              Count as
            </Label>
            <Input
              id="ing-label"
              value={pieceUnitLabel}
              onChange={(e) => {
                setPieceUnitLabel(e.target.value);
                clearError("pieceUnitLabel");
              }}
              aria-invalid={Boolean(errors.pieceUnitLabel)}
              placeholder="pcs, cups…"
            />
            <FieldError message={errors.pieceUnitLabel} />
          </div>
          <div className="flex w-32 flex-col gap-1">
            <Label htmlFor="ing-count" className="text-xs text-charcoal-900/60">
              Starting count <span className="font-normal text-charcoal-900/40">optional</span>
            </Label>
            <Input
              id="ing-count"
              type="number"
              min={0}
              step="1"
              value={pieceStock}
              onChange={(e) => {
                setPieceStockTouched(true);
                setPieceStock(e.target.value);
              }}
              placeholder="0"
            />
            {!pieceStockTouched && (
              <span className="text-[11px] text-charcoal-900/40">
                Auto: {stock || 0} × {piecesPerUnit || 0}
              </span>
            )}
          </div>
        </div>
      )}

      <div>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}
