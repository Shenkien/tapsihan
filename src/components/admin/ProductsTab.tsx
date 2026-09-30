"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { AdminProduct } from "@/types/models";
import { actionBtn } from "@/components/admin/actionStyles";

export default function ProductsTab() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const { toast } = useToast();

  async function loadProducts() {
    const res = await fetch("/api/admin/products");
    if (res.ok) setProducts(await res.json());
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort(), [products]);

  const visible = useMemo(
    () =>
      products
        .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
        .filter((p) => category === "all" || p.category === category)
        .filter((p) => status === "all" || (status === "available" ? p.active : !p.active))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [products, search, category, status]
  );

  async function toggleField(product: AdminProduct, field: "active" | "bestSeller" | "isNew") {
    await fetch(`/api/admin/products/${product.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !product[field] }),
    });
    loadProducts();
  }

  async function handleDelete(product: AdminProduct) {
    if (!confirm(`Remove "${product.name}" from the menu?`)) return;
    const res = await fetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast({ title: "Could not remove item", description: data.error, variant: "destructive" });
      return;
    }
    loadProducts();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-900/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items…"
            className="h-11 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-base placeholder:text-charcoal-900/40 focus-visible:border-achuete-600 focus-visible:outline-none"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold"
        >
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </select>
        <Link href="/admin/menu/new" className="ml-auto">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> New Item
          </Button>
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-extrabold uppercase tracking-wide text-charcoal-900/40">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Available</th>
              <th className="px-4 py-3">Best Seller</th>
              <th className="px-4 py-3">New</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-border transition-colors last:border-b-0 hover:bg-rice-50 ${
                  p.active ? "" : "bg-charcoal-900/5"
                }`}
              >
                <td className={`flex flex-wrap items-center gap-2 px-4 py-3 ${p.active ? "" : "opacity-70"}`}>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} className="h-9 w-9 rounded-lg object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded-lg bg-rice-100" />
                  )}
                  <span className={`font-semibold ${p.active ? "" : "text-charcoal-900/40 line-through"}`}>{p.name}</span>
                  {!p.active && (
                    <span className="rounded-full bg-charcoal-900/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-charcoal-900/60">
                      Unavailable
                    </span>
                  )}
                  {!p.recipeItemCount && (
                    <span
                      title="No Recipe yet — this item shows as Out of stock on the kiosk until you set one up in Admin > Recipes."
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-800"
                    >
                      No recipe
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-charcoal-900/60">{p.category}</td>
                <td className="px-4 py-3 font-semibold">₱{p.price.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <ToggleSwitch checked={p.active} onChange={() => toggleField(p, "active")} color="green" />
                </td>
                <td className="px-4 py-3">
                  <ToggleSwitch checked={p.bestSeller} onChange={() => toggleField(p, "bestSeller")} color="gold" />
                </td>
                <td className="px-4 py-3">
                  <ToggleSwitch checked={p.isNew} onChange={() => toggleField(p, "isNew")} color="red" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Link
                      href={`/admin/menu/${p.id}/edit`}
                      className={actionBtn("edit")}
                      aria-label={`Edit ${p.name}`}
                      title={`Edit ${p.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(p)}
                      className={actionBtn("delete")}
                      aria-label={`Remove ${p.name}`}
                      title={`Remove ${p.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-4 py-6 text-sm text-charcoal-900/50">No menu items match these filters.</p>
        )}
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  color = "maroon",
}: {
  checked: boolean;
  onChange: () => void;
  /** On-state track color: green for Available, gold for Best Seller,
   *  red for New. Off state is always the same neutral gray. */
  color?: "green" | "gold" | "red" | "maroon";
}) {
  const onBg =
    color === "green"
      ? "bg-[#2f9e44]"
      : color === "gold"
      ? "bg-turmeric-500"
      : color === "red"
      ? "bg-danger"
      : "bg-achuete-600";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? onBg : "bg-charcoal-900/15"}`}
    >
      {/* Positioned with `left`, not a transform — keeps the knob's
          on/off side unambiguous no matter what other transforms or
          transitions are layered on the parent. */}
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150 ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
