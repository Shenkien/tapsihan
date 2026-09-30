"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { unitLabel } from "@/lib/utils";
import type { AdminIngredient, AdminPurchaseOrder, AdminSupplier } from "@/types/models";
import { actionBtn } from "@/components/admin/actionStyles";

type Row = { ingredientId: number; qty: number; unitCost: number };

// One line in "Previously ordered from this supplier": the most recent time an
// ingredient was ordered from them, plus how many orders it has appeared in.
type SupplierHistoryItem = {
  ingredientId: number;
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
  lastDate: string;
  times: number;
};

// Today as "YYYY-MM-DD" in the browser's timezone — the earliest pickable day.
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<AdminSupplier[] | null>(null);
  const [ingredients, setIngredients] = useState<AdminIngredient[] | null>(null);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  // Optional "YYYY-MM-DD" — blank when the supplier delivers today or gives no date.
  const [expectedDate, setExpectedDate] = useState("");
  const [saving, setSaving] = useState(false);
  // True for a moment after a Reorder prefill, so the copied rows flash green.
  const [flashRows, setFlashRows] = useState(false);
  // Every PO (newest first) — powers both Reorder and the per-supplier history.
  const [allPos, setAllPos] = useState<AdminPurchaseOrder[]>([]);
  // Ingredient whose row was just added from the history list (flashes green).
  const [flashIngredientId, setFlashIngredientId] = useState<number | null>(null);

  // What has been ordered from the selected supplier before (cancelled orders
  // don't count — they were never actually bought). `allPos` is newest-first,
  // so the first time an ingredient shows up is its most recent order.
  const supplierHistory = useMemo(() => {
    if (!supplierId) return [] as SupplierHistoryItem[];
    const byIngredient = new Map<number, SupplierHistoryItem>();
    for (const po of allPos) {
      if (po.supplier.id !== supplierId || po.status === "CANCELLED") continue;
      for (const it of po.items) {
        const seen = byIngredient.get(it.ingredientId);
        if (seen) {
          seen.times += 1;
          continue;
        }
        byIngredient.set(it.ingredientId, {
          ingredientId: it.ingredientId,
          name: it.ingredient.name,
          unit: it.ingredient.unit,
          qty: it.qty,
          unitCost: it.unitCost,
          lastDate: po.createdAt,
          times: 1,
        });
      }
    }
    return [...byIngredient.values()];
  }, [allPos, supplierId]);

  useEffect(() => {
    // "Reorder" from the Suppliers page links here with ?reorder=<poId>:
    // same supplier, items and quantities, priced at what that order paid
    // (still editable for today's quote).
    const query = new URLSearchParams(window.location.search);
    const reorderId = query.get("reorder");
    // Linked from a Low Stock alert: start the order with that item, from its
    // usual supplier (if one is set), at the quantity/price of the last order.
    const ingredientParam = Number(query.get("ingredient"));
    Promise.all([
      fetch("/api/admin/suppliers").then((res) => res.json()),
      fetch("/api/admin/ingredients").then((res) => res.json()),
      fetch("/api/admin/purchase-orders")
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
    ]).then(([s, i, pos]: [AdminSupplier[], AdminIngredient[], AdminPurchaseOrder[]]) => {
      setSuppliers(s);
      setAllPos(Array.isArray(pos) ? pos : []);
      const active = i.filter((ing) => ing.active);
      setIngredients(active);
      const source = Array.isArray(pos) ? pos.find((p) => p.id === Number(reorderId)) : undefined;
      const reorderRows: Row[] = source
        ? source.items.flatMap((it) => {
            const ing = active.find((x) => x.id === it.ingredientId);
            return ing ? [{ ingredientId: ing.id, qty: it.qty, unitCost: it.unitCost }] : [];
          })
        : [];
      if (source && reorderRows.length > 0) {
        setSupplierId(source.supplier.id);
        setRows(reorderRows);
        setFlashRows(true);
        setTimeout(() => setFlashRows(false), 1900);
        return;
      }
      const wanted = ingredientParam ? active.find((x) => x.id === ingredientParam) : undefined;
      if (wanted) {
        const sid = wanted.supplierId && s.some((x) => x.id === wanted.supplierId) ? wanted.supplierId : (s[0]?.id ?? null);
        let qty = 1;
        let unitCost = wanted.cost;
        for (const po of Array.isArray(pos) ? pos : []) {
          if (po.supplier.id !== sid || po.status === "CANCELLED") continue;
          const line = po.items.find((it) => it.ingredientId === wanted.id);
          if (line) {
            qty = line.qty;
            unitCost = line.unitCost;
            break;
          }
        }
        setSupplierId(sid);
        setRows([{ ingredientId: wanted.id, qty, unitCost }]);
        setFlashRows(true);
        setTimeout(() => setFlashRows(false), 1900);
        return;
      }
      setSupplierId(s[0]?.id ?? null);
      if (active[0]) setRows([{ ingredientId: active[0].id, qty: 1, unitCost: active[0].cost }]);
    });
  }, []);

  // Each row's unit cost starts pre-filled from the ingredient's last known
  // cost (a reasonable default), but is now editable — the admin types in
  // the real price quoted by the supplier for this order. That's the value
  // saved on the PurchaseOrderItem and, later, written back to the
  // Ingredient's own cost when the PO is marked Received.

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (!ingredients?.[0]) return;
    setRows((prev) => [...prev, { ingredientId: ingredients[0].id, qty: 1, unitCost: ingredients[0].cost }]);
  }

  // The page opens with one placeholder row (first ingredient, qty 1). While
  // it's untouched, adding from history replaces it instead of piling on.
  function isPristine(list: Row[]) {
    const first = ingredients?.[0];
    return Boolean(first) && list.length === 1 && list[0].ingredientId === first!.id && list[0].qty === 1 && list[0].unitCost === first!.cost;
  }

  function addFromHistory(h: SupplierHistoryItem) {
    if (!ingredients?.some((x) => x.id === h.ingredientId)) return;
    setRows((prev) => {
      const line: Row = { ingredientId: h.ingredientId, qty: h.qty, unitCost: h.unitCost };
      if (isPristine(prev)) return [line];
      if (prev.some((r) => r.ingredientId === h.ingredientId)) return prev;
      return [...prev, line];
    });
    setFlashIngredientId(h.ingredientId);
    setTimeout(() => setFlashIngredientId(null), 1900);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId || rows.length === 0) {
      toast({ title: "Pick a supplier and add at least one item", variant: "destructive" });
      return;
    }
    if (rows.some((r) => !r.ingredientId)) {
      toast({ title: "Pick an item on every line", variant: "destructive" });
      return;
    }
    if (rows.some((r) => !(r.qty > 0))) {
      toast({ title: "Enter a quantity greater than 0 on every line", variant: "destructive" });
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, items: rows, expectedDate: expectedDate || null }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Could not create purchase order", description: data.error, variant: "destructive" });
      return;
    }
    toast({ description: `${data.poNumber} created.` });
    router.push(`/admin/purchase-orders?highlight=${data.id}`);
    router.refresh();
  }

  if (!suppliers || !ingredients) return <p className="opacity-60">Loading…</p>;

  // Skip ingredients that have since been deactivated — they can't be ordered.
  const visibleHistory = supplierHistory.filter((h) => ingredients.some((x) => x.id === h.ingredientId));

  if (suppliers.length === 0) {
    return (
      <>
        <PageHeader title="New Purchase Order" description="Order stock from a supplier." />
        <p className="text-sm text-charcoal-900/50">
          Add a supplier first — see the <a href="/admin/suppliers" className="font-semibold text-achuete-600">Suppliers</a> page.
        </p>
      </>
    );
  }

  if (ingredients.length === 0) {
    return (
      <>
        <PageHeader title="New Purchase Order" description="Order stock from a supplier." />
        <p className="text-sm text-charcoal-900/50">
          Add an inventory item first — see the <a href="/admin/ingredients" className="font-semibold text-achuete-600">Inventory Items</a> page.
          A Purchase Order always buys raw inventory items (onion, chicken thigh, rice…), never finished Menu Items.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New Purchase Order" description="Order inventory items from a supplier — receiving it later restocks everything below." />
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor="po-supplier" required filled={Boolean(supplierId)}>
            Supplier
          </Label>
          <select
            id="po-supplier"
            value={supplierId ?? ""}
            onChange={(e) => setSupplierId(Number(e.target.value))}
            className="h-11 rounded-xl border border-border bg-white px-3 text-base"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex max-w-2xl flex-col gap-2 rounded-2xl border border-border bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-charcoal-900/50">
            Previously ordered from {suppliers.find((s) => s.id === supplierId)?.name ?? "this supplier"}
          </p>
          {visibleHistory.length === 0 ? (
            <p className="text-sm text-charcoal-900/50">No orders from this supplier yet — pick items below.</p>
          ) : (
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {visibleHistory.map((h) => {
                const added = rows.some((r) => r.ingredientId === h.ingredientId) && !isPristine(rows);
                return (
                  <div key={h.ingredientId} className="flex items-center justify-between gap-3 rounded-xl bg-rice-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{h.name}</p>
                      <p className="text-xs text-charcoal-900/60">
                        Last: {h.qty} {unitLabel(h.unit)} · ₱{h.unitCost.toFixed(2)}/{unitLabel(h.unit)} ·{" "}
                        {new Date(h.lastDate).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                        {h.times > 1 ? ` · ordered ${h.times}×` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="shrink-0 gap-1.5"
                      disabled={added}
                      onClick={() => addFromHistory(h)}
                    >
                      {added ? (
                        "Added ✓"
                      ) : (
                        <>
                          <Plus className="h-4 w-4" /> Add
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-charcoal-900/50">
            Add fills in the quantity and price from that supplier&apos;s last order — change them if today&apos;s
            quote is different.
          </p>
        </div>

        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor="po-expected">
            Expected delivery <span className="font-normal text-charcoal-900/40">optional</span>
          </Label>
          <Input
            id="po-expected"
            type="date"
            value={expectedDate}
            min={todayLocal()}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
          <p className="text-xs text-charcoal-900/50">
            The day the supplier said they&apos;ll deliver. Leave blank if they deliver today or didn&apos;t give a
            date — the order is flagged overdue once this day has passed.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label required filled={rows.length > 0 && rows.every((r) => r.qty > 0)}>
              Inventory items to order
            </Label>
            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={addRow}>
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const ingredient = ingredients.find((ing) => ing.id === row.ingredientId);
              return (
                <div key={i} className={`flex items-center gap-2 rounded-xl ${flashRows || flashIngredientId === row.ingredientId ? "row-flash" : ""}`}>
                  <select
                    value={row.ingredientId}
                    onChange={(e) => {
                      const ing = ingredients.find((x) => x.id === Number(e.target.value));
                      updateRow(i, { ingredientId: Number(e.target.value), unitCost: ing?.cost ?? row.unitCost });
                    }}
                    className="h-11 flex-1 rounded-xl border border-border bg-white px-3 text-base"
                  >
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={row.qty}
                    onChange={(e) => updateRow(i, { qty: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-20"
                    placeholder="Qty"
                    aria-invalid={row.qty <= 0}
                    title={row.qty <= 0 ? "Quantity must be more than 0" : undefined}
                  />
                  <span className="w-10 shrink-0 text-xs font-semibold text-charcoal-900/50">
                    {ingredient ? unitLabel(ingredient.unit) : ""}
                  </span>
                  <span className="shrink-0 text-charcoal-900/50">₱</span>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={row.unitCost}
                    onChange={(e) => updateRow(i, { unitCost: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-24"
                    placeholder="Unit cost"
                  />
                  <span className="w-24 shrink-0 text-right text-sm font-semibold text-charcoal-900/70">
                    ₱{(row.qty * row.unitCost).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className={actionBtn("delete")}
                    aria-label="Remove row"
                    title="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-charcoal-900/50">
            Unit cost starts out pre-filled from this ingredient&apos;s last known cost, but type in
            today&apos;s actual supplier price here — that&apos;s what gets saved as the new cost when you
            Receive this order.
          </p>
          {rows.length > 0 && (
            <div className="flex justify-end border-t border-border pt-2 text-sm font-bold text-charcoal-900">
              Total: ₱{rows.reduce((sum, r) => sum + r.qty * r.unitCost, 0).toFixed(2)}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving || rows.length === 0 || rows.some((r) => r.qty <= 0)}>
            {saving ? "Creating…" : "Create Purchase Order"}
          </Button>
          {rows.length === 0 ? (
            <span className="self-center text-xs font-semibold text-danger">Add at least one item</span>
          ) : rows.some((r) => r.qty <= 0) ? (
            <span className="self-center text-xs font-semibold text-danger">Every item needs a quantity above 0</span>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => router.push("/admin/purchase-orders")}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
