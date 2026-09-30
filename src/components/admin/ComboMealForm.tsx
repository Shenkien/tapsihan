"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, UnsavedBadge } from "@/components/ui/field-error";
import { moneyError, nameError } from "@/lib/formRules";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import PhotoUploadField from "@/components/admin/PhotoUploadField";
import type { AdminCombo } from "@/types/models";
import type { AdminProduct } from "@/types/models";
import { actionBtn } from "@/components/admin/actionStyles";

type Row = { productId: number; qty: number };

export default function ComboMealForm({
  products,
  initial,
}: {
  products: AdminProduct[];
  /** Omit for create; pass the existing combo for edit. */
  initial?: AdminCombo;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(initial);

  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [available, setAvailable] = useState(initial?.active ?? true);
  const [rows, setRows] = useState<Row[]>(
    initial?.items.map((i) => ({ productId: i.productId, qty: i.qty })) ??
      (products[0] ? [{ productId: products[0].id, qty: 1 }] : [])
  );
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

  const [baseline] = useState(() =>
    JSON.stringify([
      initial?.imageUrl ?? null,
      initial?.name ?? "",
      initial?.description ?? "",
      initial ? String(initial.price) : "",
      initial?.active ?? true,
      initial?.items.map((i) => [i.productId, i.qty]) ?? (products[0] ? [[products[0].id, 1]] : []),
    ])
  );
  const dirty =
    JSON.stringify([imageUrl, name, description, price, available, rows.map((r) => [r.productId, r.qty])]) !== baseline;

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    clearError("items");
    setRows((prev) => {
      const usedIds = new Set(prev.map((r) => r.productId));
      const next = products.find((p) => !usedIds.has(p.id)) ?? products[0];
      if (!next) return prev;
      return [...prev, { productId: next.id, qty: 1 }];
    });
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  // Live costing summary from the selected items — no manual adding-up
  // needed to see whether the bundle price still leaves a profit.
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const { regularTotal, costTotal } = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const product = productsById.get(row.productId);
        if (!product) return acc;
        return {
          regularTotal: acc.regularTotal + product.price * row.qty,
          costTotal: acc.costTotal + product.cost * row.qty,
        };
      },
      { regularTotal: 0, costTotal: 0 }
    );
  }, [rows, productsById]);
  const enteredPrice = Number(price) || 0;
  const savings = regularTotal - enteredPrice;
  const profit = enteredPrice - costTotal;
  const margin = enteredPrice > 0 ? (profit / enteredPrice) * 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const nameProblem = nameError(name, "Combo name");
    if (nameProblem) next.name = nameProblem;
    const priceProblem = moneyError(price, "Bundle price", { required: true, max: 100_000 });
    if (priceProblem) next.price = priceProblem;
    if (rows.length === 0) next.items = "Add at least one menu item";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast({ title: "Please fix the highlighted fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      imageUrl,
      price: Number(price),
      active: available,
      items: rows,
    };
    const res = await fetch(isEdit ? `/api/admin/combos/${initial!.id}` : "/api/admin/combos", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast({ title: isEdit ? "Could not save changes" : "Could not create combo", description: data.error, variant: "destructive" });
      return;
    }
    toast({ title: isEdit ? "Combo updated" : "Combo created" });
    router.push("/admin/combos");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-8">
        <PhotoUploadField imageUrl={imageUrl} onChange={setImageUrl} />

        <div className="flex min-w-[260px] flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="combo-name" required filled={!errors.name && name.trim().length > 0}>
              Combo name
            </Label>
            <Input
              id="combo-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError("name");
              }}
              aria-invalid={Boolean(errors.name)}
              placeholder="e.g. Tapsilog and Drink Combo"
            />
            <FieldError message={errors.name} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="combo-description">
              Description <span className="font-normal text-charcoal-900/40">optional</span>
            </Label>
            <Textarea id="combo-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex min-w-[140px] flex-col gap-1.5">
              <Label htmlFor="combo-price" required filled={!errors.price && price !== ""}>
                Bundle price (₱)
              </Label>
              <Input
                id="combo-price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  clearError("price");
                }}
                aria-invalid={Boolean(errors.price)}
                placeholder="0.00"
              />
              <FieldError message={errors.price} />
            </div>
            <div className="flex min-w-[160px] flex-col gap-1.5">
              <Label htmlFor="combo-availability">Availability</Label>
              <select
                id="combo-availability"
                value={available ? "available" : "unavailable"}
                onChange={(e) => setAvailable(e.target.value === "available")}
                className="h-11 rounded-xl border border-border bg-white px-3 text-base"
              >
                <option value="available">Available</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label required filled={rows.length > 0}>
            Included menu items
          </Label>
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={addRow}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => {
            // Menu items already picked in another row can't be picked again
            // (the API rejects duplicates), so grey them out here instead of
            // letting the admin hit a save error after filling in the rest
            // of the form.
            const pickedElsewhere = new Set(rows.filter((_, j) => j !== i).map((r) => r.productId));
            return (
            <div key={i} className="flex items-center gap-2">
              <select
                value={row.productId}
                onChange={(e) => updateRow(i, { productId: Number(e.target.value) })}
                className="h-11 flex-1 rounded-xl border border-border bg-white px-3 text-base"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id} disabled={pickedElsewhere.has(p.id)}>
                    {p.name}
                    {pickedElsewhere.has(p.id) ? " (already in this combo)" : ""}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min={1}
                value={row.qty}
                onChange={(e) => updateRow(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                className="w-20"
              />
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
          {rows.length === 0 && (
            <p className="rounded-xl border border-dashed border-danger/40 bg-red-50 px-3 py-2 text-sm font-semibold text-danger">
              Add at least one menu item.
            </p>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-rice-50 p-4 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-charcoal-900/50">
              Regular total
            </span>
            <span className="text-lg font-bold">₱{regularTotal.toFixed(2)}</span>
            <span className="text-[11px] text-charcoal-900/40">If bought separately</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-charcoal-900/50">
              Savings
            </span>
            <span className={`text-lg font-bold ${savings > 0 ? "text-success-text" : "text-danger"}`}>
              ₱{savings.toFixed(2)}
            </span>
            <span className="text-[11px] text-charcoal-900/40">
              {regularTotal > 0 ? `${((savings / regularTotal) * 100).toFixed(0)}% off regular` : "vs bundle price"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-charcoal-900/50">
              Combo cost
            </span>
            <span className="text-lg font-bold">₱{costTotal.toFixed(2)}</span>
            <span className="text-[11px] text-charcoal-900/40">To make this combo</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-charcoal-900/50">
              Profit
            </span>
            <span className={`text-lg font-bold ${profit > 0 ? "text-success-text" : "text-danger"}`}>
              ₱{profit.toFixed(2)}
            </span>
            <span className="text-[11px] text-charcoal-900/40">
              {enteredPrice > 0 ? `${margin.toFixed(0)}% margin` : "Enter a bundle price"}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving || (isEdit && !dirty)}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Combo"}
        </Button>
        {isEdit && !dirty && <span className="self-center text-xs font-semibold text-charcoal-900/50">Change something to enable Save</span>}
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/combos")}>
          Cancel
        </Button>
        {dirty && <UnsavedBadge />}
      </div>
    </form>
  );
}
