"use client";

import { useEffect, useState } from "react";
import { Pencil, Check, X, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useRowFlash } from "@/hooks/useRowFlash";
import { nameError } from "@/lib/formRules";
import { actionBtn, activePill } from "@/components/admin/actionStyles";
import type { AdminDiscount } from "@/types/models";

function percentError(raw: string): string | null {
  if (raw.trim() === "") return "Enter a percentage";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Enter a number";
  if (n <= 0) return "Must be more than 0";
  if (n > 100) return "Can't be more than 100";
  return null;
}

export default function DiscountsTab() {
  const [discounts, setDiscounts] = useState<AdminDiscount[] | null>(null);
  const [newName, setNewName] = useState("");
  const [newPercent, setNewPercent] = useState("");
  const [addErrors, setAddErrors] = useState<{ name?: string; percent?: string }>({});
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", percent: "" });
  const [draftError, setDraftError] = useState<string | null>(null);
  const { flash, flashClass } = useRowFlash();
  const { toast } = useToast();

  async function load() {
    const res = await fetch("/api/admin/discounts");
    if (res.ok) setDiscounts(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function createDiscount(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const problems = {
      name: nameError(name, "Name", 60) ?? undefined,
      percent: percentError(newPercent) ?? undefined,
    };
    setAddErrors(problems);
    if (problems.name || problems.percent) return;

    setCreating(true);
    const res = await fetch("/api/admin/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, percent: Number(newPercent) }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      toast({ title: "Could not add discount", description: data.error, variant: "destructive" });
      return;
    }
    setNewName("");
    setNewPercent("");
    setAddErrors({});
    await load();
    if (data?.id) flash(data.id);
  }

  function startEdit(d: AdminDiscount) {
    setEditingId(d.id);
    setDraftError(null);
    setDraft({ name: d.name, percent: String(d.percent) });
  }

  async function saveEdit(d: AdminDiscount) {
    const name = draft.name.trim();
    const problem = nameError(name, "Name", 60) ?? percentError(draft.percent);
    setDraftError(problem);
    if (problem) return;

    const res = await fetch(`/api/admin/discounts/${d.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, percent: Number(draft.percent) }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: "Could not save changes", description: data.error, variant: "destructive" });
      return;
    }
    toast({ description: `Saved "${name}" at ${draft.percent}%. New orders use this rate.` });
    setEditingId(null);
    await load();
    flash(d.id);
  }

  async function toggleActive(d: AdminDiscount) {
    const res = await fetch(`/api/admin/discounts/${d.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !d.active }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast({ title: "Could not update discount", description: data.error, variant: "destructive" });
      return;
    }
    await load();
    flash(d.id);
  }

  async function removeDiscount(d: AdminDiscount) {
    if (!confirm(`Remove "${d.name}"? Past receipts keep the discount they had.`)) return;
    const res = await fetch(`/api/admin/discounts/${d.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast({ title: "Could not remove discount", description: data.error, variant: "destructive" });
      return;
    }
    toast({ description: `${d.name} removed.` });
    load();
  }

  if (!discounts) return <p className="opacity-60">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={createDiscount} noValidate className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-[200px] flex-col gap-1">
          <Label htmlFor="discount-name" required filled={!addErrors.name && newName.trim().length > 0} className="text-xs text-charcoal-900/60">
            Name
          </Label>
          <Input
            id="discount-name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setAddErrors((p) => ({ ...p, name: undefined }));
            }}
            aria-invalid={Boolean(addErrors.name)}
            placeholder="e.g. PWD"
          />
          <FieldError message={addErrors.name} />
        </div>
        <div className="flex w-28 flex-col gap-1">
          <Label htmlFor="discount-percent" required filled={!addErrors.percent && newPercent.trim().length > 0} className="text-xs text-charcoal-900/60">
            Percent (%)
          </Label>
          <Input
            id="discount-percent"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            value={newPercent}
            onChange={(e) => {
              setNewPercent(e.target.value);
              setAddErrors((p) => ({ ...p, percent: undefined }));
            }}
            aria-invalid={Boolean(addErrors.percent)}
            placeholder="20"
          />
          <FieldError message={addErrors.percent} />
        </div>
        <Button type="submit" size="sm" disabled={creating} className="mt-6 gap-1.5">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      <div className="rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-wide text-charcoal-900/40">
          {discounts.length} discount{discounts.length === 1 ? "" : "s"}
        </div>
        {discounts.length === 0 && <p className="px-4 py-6 text-sm opacity-60">No discounts yet. Add one above.</p>}
        {discounts.map((d) => (
          <div
            key={d.id}
            className={`flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-b-0 hover:bg-rice-50 ${
              editingId === d.id ? "bg-sky-50" : ""
            } ${flashClass(d.id)}`}
          >
            {editingId === d.id ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    autoFocus
                    value={draft.name}
                    onChange={(e) => {
                      setDraft((x) => ({ ...x, name: e.target.value }));
                      setDraftError(null);
                    }}
                    aria-invalid={Boolean(draftError)}
                    className="w-48"
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={draft.percent}
                    onChange={(e) => {
                      setDraft((x) => ({ ...x, percent: e.target.value }));
                      setDraftError(null);
                    }}
                    aria-invalid={Boolean(draftError)}
                    className="w-24"
                  />
                  <span className="text-sm">%</span>
                  <FieldError message={draftError} className="mt-0" />
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => saveEdit(d)} className={actionBtn("save")} title="Save" aria-label="Save">
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className={actionBtn("cancel")} title="Cancel" aria-label="Cancel">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className={`font-semibold ${d.active ? "" : "opacity-50"}`}>{d.name}</span>
                  <span className="rounded-full bg-turmeric-500/20 px-2.5 py-0.5 text-sm font-bold">{d.percent}% off</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(d)}
                    className={activePill(d.active)}
                    title={d.active ? "Tap to hide from the counter" : "Tap to show on the counter"}
                  >
                    {d.active ? "Active" : "Inactive"}
                  </button>
                  <button type="button" onClick={() => startEdit(d)} className={actionBtn("edit")} title="Edit" aria-label={`Edit ${d.name}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => removeDiscount(d)} className={actionBtn("delete")} title="Remove" aria-label={`Remove ${d.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
