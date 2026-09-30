"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, UnsavedBadge } from "@/components/ui/field-error";
import { moneyError, nameError } from "@/lib/formRules";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import PhotoUploadField from "@/components/admin/PhotoUploadField";
import { recipeItemCost } from "@/lib/utils";
import type { AdminProduct, AdminCategory, AdminIngredient, AdminRecipeItem } from "@/types/models";
import { fetchJson } from "@/lib/fetchJson";

export default function MenuItemForm({
  categories,
  initial,
}: {
  /** The maintained Menu Item category list (Admin > Categories, type=PRODUCT). */
  categories: AdminCategory[];
  /** Omit for create; pass the existing product for edit. */
  initial?: AdminProduct;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(initial);
  const activeCategories = categories.filter((c) => c.active);

  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? activeCategories[0]?.name ?? "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [cost, setCost] = useState(initial ? String(initial.cost) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [available, setAvailable] = useState(initial?.active ?? true);
  const [bestSeller, setBestSeller] = useState(initial?.bestSeller ?? false);
  const [isNew, setIsNew] = useState(initial?.isNew ?? false);
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

  // Unsaved-changes tracking: compare the current fields with what the form
  // started with, so Save can stay gray until something actually changed.
  const [baseline] = useState(() =>
    JSON.stringify([
      initial?.imageUrl ?? null,
      initial?.name ?? "",
      initial?.category ?? activeCategories[0]?.name ?? "",
      initial ? String(initial.price) : "",
      initial ? String(initial.cost) : "",
      initial?.description ?? "",
      initial?.active ?? true,
      initial?.bestSeller ?? false,
      initial?.isNew ?? false,
    ])
  );
  const dirty =
    JSON.stringify([imageUrl, name, category, price, cost, description, available, bestSeller, isNew]) !== baseline;

  // If this item already has a Recipe, work out what that recipe actually
  // costs (ingredient cost × qty, from Admin > Recipes) so the Cost field
  // below can offer it as a one-click suggestion instead of relying on
  // whatever was typed in last, possibly a while ago.
  const [recipeCost, setRecipeCost] = useState<number | null>(null);
  useEffect(() => {
    if (!isEdit || !initial?.recipeItemCount) return;
    // Both responses used to go straight from res.json() into reduce/find. On
    // a 401 or 500 the body is `{ error: ... }`, so `.reduce` threw and took
    // the whole form down — over a field that is only a convenience.
    let cancelled = false;
    Promise.all([
      fetchJson<AdminRecipeItem[]>(`/api/admin/products/${initial.id}/recipe`),
      fetchJson<AdminIngredient[]>("/api/admin/ingredients"),
    ]).then(([recipeItems, allIngredients]) => {
      if (cancelled) return;
      if (!Array.isArray(recipeItems) || !Array.isArray(allIngredients)) return;
      const total = recipeItems.reduce((sum, item) => {
        const ingredient = allIngredients.find((ing) => ing.id === item.ingredientId);
        return ingredient ? sum + recipeItemCost(ingredient, item.qty) : sum;
      }, 0);
      setRecipeCost(total);
    });
    return () => {
      cancelled = true;
    };
  }, [isEdit, initial?.id, initial?.recipeItemCount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const nameProblem = nameError(name, "Item name");
    if (nameProblem) next.name = nameProblem;
    if (!category) next.category = "Pick a category";
    const priceProblem = moneyError(price, "Price", { required: true, max: 100_000 });
    if (priceProblem) next.price = priceProblem;
    const costProblem = moneyError(cost, "Cost", { max: 100_000 });
    if (costProblem) next.cost = costProblem;
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast({ title: "Please fix the highlighted fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      category,
      price: Number(price),
      cost: cost === "" ? 0 : Number(cost),
      imageUrl,
      description: description.trim() || null,
      active: available,
      bestSeller,
      isNew,
    };
    const res = await fetch(isEdit ? `/api/admin/products/${initial!.id}` : "/api/admin/products", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast({ title: isEdit ? "Could not save changes" : "Could not create item", description: data.error, variant: "destructive" });
      return;
    }
    toast({ title: isEdit ? "Item updated" : "Item created" });
    router.push("/admin/menu");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-8">
        <PhotoUploadField imageUrl={imageUrl} onChange={setImageUrl} />

        <div className="flex min-w-[260px] flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-name" required filled={!errors.name && name.trim().length > 0}>
              Item Name
            </Label>
            <Input
              id="item-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError("name");
              }}
              aria-invalid={Boolean(errors.name)}
              placeholder="e.g. Tapsilog"
            />
            <FieldError message={errors.name} />
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
              <Label htmlFor="item-category" required filled={Boolean(category) && !errors.category}>
                Category
              </Label>
              {activeCategories.length > 0 ? (
                <select
                  id="item-category"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    clearError("category");
                  }}
                  aria-invalid={Boolean(errors.category)}
                  className="h-11 rounded-xl border border-border bg-white px-3 text-base focus-visible:border-achuete-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-achuete-600/30 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-red-50"
                >
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <a href="/admin/categories" className="text-sm font-semibold text-achuete-600 underline">
                  Add a Menu Item category in Maintenance first →
                </a>
              )}
              <FieldError message={errors.category} />
            </div>

            <div className="flex min-w-[140px] flex-col gap-1.5">
              <Label htmlFor="item-price" required filled={!errors.price && price !== ""}>
                Price (₱)
              </Label>
              <Input
                id="item-price"
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

            <div className="flex min-w-[140px] flex-col gap-1.5">
              <Label htmlFor="item-cost">
                Cost (₱) <span className="font-normal text-charcoal-900/40">optional</span>
              </Label>
              <Input
                id="item-cost"
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
          </div>
          {recipeCost !== null && Math.abs(recipeCost - Number(cost || 0)) > 0.005 && (
            <p className="text-xs font-semibold text-achuete-600">
              This item&apos;s Recipe currently works out to ₱{recipeCost.toFixed(2)} per serving.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setCost(recipeCost.toFixed(2))}
              >
                Use this
              </button>
            </p>
          )}
          <p className="text-xs text-charcoal-900/50">
            Cost is what this item costs you to make — used for margin, not shown to customers. If it
            has a Recipe (Admin &gt; Recipes), that page can compute this for you from ingredient
            prices instead of you tracking it by hand.
          </p>
          <p className="text-xs text-charcoal-900/50">
            Every item — including drinks and other sold-as-is products — gets its availability from
            its linked Inventory Item(s) in Admin &gt; Recipes. A new item shows on the kiosk grayed out
            as &quot;Out of stock&quot; until you set up its Recipe there.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-description">
          Description <span className="font-normal text-charcoal-900/40">optional</span>
        </Label>
        <Textarea id="item-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Checkbox checked={available} onChange={(e) => setAvailable(e.target.checked)} />
          Available
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Checkbox checked={bestSeller} onChange={(e) => setBestSeller(e.target.checked)} />
          Best Seller
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Checkbox checked={isNew} onChange={(e) => setIsNew(e.target.checked)} />
          New
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving || (isEdit && !dirty)}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Item"}
        </Button>
        {isEdit && !dirty && <span className="text-xs font-semibold text-charcoal-900/50">Change something to enable Save</span>}
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/menu")}>
          Cancel
        </Button>
        {dirty && <UnsavedBadge />}
        {isEdit && (
          <a href="/admin/recipes" className="ml-auto text-sm font-semibold text-achuete-600">
            Set up this item&apos;s recipe →
          </a>
        )}
      </div>
    </form>
  );
}
