"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Check, X, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { nameError } from "@/lib/formRules";
import { useRowFlash } from "@/hooks/useRowFlash";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { AdminCategory } from "@/types/models";
import { actionBtn, activePill } from "@/components/admin/actionStyles";

type CategoryType = "INGREDIENT" | "PRODUCT";

const TYPE_TABS: { type: CategoryType; label: string; hint: string }[] = [
  {
    type: "INGREDIENT",
    label: "Inventory Item Categories",
    hint: "Feeds the Category dropdown when adding an Inventory Item (Admin > Inventory Items).",
  },
  {
    type: "PRODUCT",
    label: "Menu Item Categories",
    hint: "Feeds the Category dropdown when adding a Menu Item (Admin > Menu Items).",
  },
];

export default function CategoriesTab() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [activeType, setActiveType] = useState<CategoryType>("INGREDIENT");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const { flash, flashClass } = useRowFlash();
  const { toast } = useToast();

  async function load() {
    const res = await fetch("/api/admin/categories");
    if (res.ok) setCategories(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(
    () => (categories ?? []).filter((c) => c.type === activeType).sort((a, b) => a.name.localeCompare(b.name)),
    [categories, activeType]
  );

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const problem = nameError(name, "Category name", 80);
    setAddError(problem);
    if (problem) return;
    setCreating(true);
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: activeType }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      toast({ title: "Could not add category", description: data.error, variant: "destructive" });
      return;
    }
    setNewName("");
    setAddError(null);
    await load();
    if (data?.id) flash(data.id);
  }

  async function renameCategory(category: AdminCategory) {
    const name = draftName.trim();
    if (name === category.name) {
      setEditingId(null);
      return;
    }
    const problem = nameError(name, "Category name", 80);
    setDraftError(problem);
    if (problem) return;
    const res = await fetch(`/api/admin/categories/${category.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: "Could not rename category", description: data.error, variant: "destructive" });
      return;
    }
    toast({ description: `Renamed "${category.name}" to "${name}" — updated everywhere it was used.` });
    setEditingId(null);
    await load();
    flash(category.id);
  }

  async function toggleActive(category: AdminCategory) {
    const res = await fetch(`/api/admin/categories/${category.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !category.active }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast({ title: "Could not update category", description: data.error, variant: "destructive" });
      return;
    }
    await load();
    flash(category.id);
  }

  async function removeCategory(category: AdminCategory) {
    if (!confirm(`Remove "${category.name}"?`)) return;
    const res = await fetch(`/api/admin/categories/${category.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast({ title: "Could not remove category", description: data.error, variant: "destructive" });
      return;
    }
    toast({ description: `${category.name} removed.` });
    load();
  }

  if (!categories) return <p className="opacity-60">Loading…</p>;

  const tab = TYPE_TABS.find((t) => t.type === activeType)!;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TYPE_TABS.map((t) => (
          <button
            key={t.type}
            onClick={() => setActiveType(t.type)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              activeType === t.type
                ? "bg-achuete-600 text-white shadow-sm"
                : "bg-white text-charcoal-900/60 hover:bg-rice-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-charcoal-900/50">{tab.hint}</p>

      <form onSubmit={createCategory} noValidate className="flex items-start gap-2">
        <div className="flex min-w-[220px] flex-col gap-1">
          <Label htmlFor="category-name" required filled={!addError && newName.trim().length > 0} className="text-xs text-charcoal-900/60">
            New {activeType === "INGREDIENT" ? "inventory item" : "menu item"} category
          </Label>
          <Input
            id="category-name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setAddError(null);
            }}
            aria-invalid={Boolean(addError)}
            placeholder={activeType === "INGREDIENT" ? "e.g. Meats" : "e.g. Silog"}
          />
          <FieldError message={addError} />
        </div>
        <Button type="submit" size="sm" disabled={creating} className="mt-6 gap-1.5">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      <div className="rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-wide text-charcoal-900/40">
          {visible.length} categor{visible.length === 1 ? "y" : "ies"}
        </div>
        {visible.map((cat) => (
          <div
            key={cat.id}
            className={`flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-b-0 hover:bg-rice-50 ${
              editingId === cat.id ? "bg-sky-50" : ""
            } ${flashClass(cat.id)}`}
          >
            {editingId === cat.id ? (
              <>
                <Input
                  autoFocus
                  value={draftName}
                  aria-invalid={Boolean(draftError)}
                  onChange={(e) => {
                    setDraftName(e.target.value);
                    setDraftError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameCategory(cat);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="max-w-xs"
                />
                <FieldError message={draftError} className="mt-0 flex-1" />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => renameCategory(cat)}
                    className={actionBtn("save")}
                    aria-label="Save"
                    title="Save"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className={actionBtn("cancel")}
                    aria-label="Cancel"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className={`font-semibold ${cat.active ? "" : "text-charcoal-900/40 line-through"}`}>
                  {cat.name}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleActive(cat)}
                    className={activePill(cat.active)}
                    title={cat.active ? "Hide from dropdowns without deleting" : "Make available again"}
                  >
                    {cat.active ? "Active" : "Inactive"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(cat.id);
                      setDraftName(cat.name);
                      setDraftError(null);
                    }}
                    className={actionBtn("edit")}
                    aria-label={`Rename ${cat.name}`}
                    title={`Rename ${cat.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeCategory(cat)}
                    className={actionBtn("delete")}
                    aria-label={`Delete ${cat.name}`}
                    title={`Delete ${cat.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <p className="px-4 py-6 text-sm text-charcoal-900/50">No categories yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
