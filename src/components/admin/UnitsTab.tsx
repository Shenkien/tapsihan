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
import type { AdminUnitOfMeasure } from "@/types/models";
import { actionBtn, activePill } from "@/components/admin/actionStyles";

export default function UnitsTab() {
  const [units, setUnits] = useState<AdminUnitOfMeasure[] | null>(null);
  const [newName, setNewName] = useState("");
  const [newAbbreviation, setNewAbbreviation] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", abbreviation: "" });
  const [addErrors, setAddErrors] = useState<{ name?: string; abbreviation?: string }>({});
  const [draftError, setDraftError] = useState<string | null>(null);
  const { flash, flashClass } = useRowFlash();
  const { toast } = useToast();

  async function load() {
    const res = await fetch("/api/admin/units");
    if (res.ok) setUnits(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => (units ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [units]);

  async function createUnit(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const abbreviation = newAbbreviation.trim();
    const problems = {
      name: nameError(name, "Name", 80) ?? undefined,
      abbreviation: nameError(abbreviation, "Abbreviation", 20) ?? undefined,
    };
    setAddErrors(problems);
    if (problems.name || problems.abbreviation) return;
    setCreating(true);
    const res = await fetch("/api/admin/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, abbreviation }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      toast({ title: "Could not add unit", description: data.error, variant: "destructive" });
      return;
    }
    setNewName("");
    setNewAbbreviation("");
    setAddErrors({});
    await load();
    if (data?.id) flash(data.id);
  }

  function startEdit(unit: AdminUnitOfMeasure) {
    setEditingId(unit.id);
    setDraftError(null);
    setDraft({ name: unit.name, abbreviation: unit.abbreviation });
  }

  async function saveEdit(unit: AdminUnitOfMeasure) {
    const name = draft.name.trim();
    const abbreviation = draft.abbreviation.trim();
    const problem = nameError(name, "Name", 80) ?? nameError(abbreviation, "Abbreviation", 20);
    setDraftError(problem);
    if (problem) return;
    const res = await fetch(`/api/admin/units/${unit.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, abbreviation }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: "Could not save changes", description: data.error, variant: "destructive" });
      return;
    }
    toast({ description: `Saved "${abbreviation}" — updated on every Inventory Item using it.` });
    setEditingId(null);
    await load();
    flash(unit.id);
  }

  async function toggleActive(unit: AdminUnitOfMeasure) {
    const res = await fetch(`/api/admin/units/${unit.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !unit.active }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast({ title: "Could not update unit", description: data.error, variant: "destructive" });
      return;
    }
    await load();
    flash(unit.id);
  }

  async function removeUnit(unit: AdminUnitOfMeasure) {
    if (!confirm(`Remove "${unit.name}"?`)) return;
    const res = await fetch(`/api/admin/units/${unit.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast({ title: "Could not remove unit", description: data.error, variant: "destructive" });
      return;
    }
    toast({ description: `${unit.name} removed.` });
    load();
  }

  if (!units) return <p className="opacity-60">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={createUnit} noValidate className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-[180px] flex-col gap-1">
          <Label htmlFor="unit-name" required filled={!addErrors.name && newName.trim().length > 0} className="text-xs text-charcoal-900/60">
            Name
          </Label>
          <Input
            id="unit-name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setAddErrors((p) => ({ ...p, name: undefined }));
            }}
            aria-invalid={Boolean(addErrors.name)}
            placeholder="e.g. Kilogram"
          />
          <FieldError message={addErrors.name} />
        </div>
        <div className="flex w-32 flex-col gap-1">
          <Label htmlFor="unit-abbr" required filled={!addErrors.abbreviation && newAbbreviation.trim().length > 0} className="text-xs text-charcoal-900/60">
            Abbreviation
          </Label>
          <Input
            id="unit-abbr"
            value={newAbbreviation}
            onChange={(e) => {
              setNewAbbreviation(e.target.value);
              setAddErrors((p) => ({ ...p, abbreviation: undefined }));
            }}
            aria-invalid={Boolean(addErrors.abbreviation)}
            placeholder="e.g. kg"
          />
          <FieldError message={addErrors.abbreviation} />
        </div>
        <Button type="submit" size="sm" disabled={creating} className="mt-6 gap-1.5">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      <div className="rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-wide text-charcoal-900/40">
          {sorted.length} unit{sorted.length === 1 ? "" : "s"}
        </div>
        {sorted.map((u) => (
          <div
            key={u.id}
            className={`flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-b-0 hover:bg-rice-50 ${
              editingId === u.id ? "bg-sky-50" : ""
            } ${flashClass(u.id)}`}
          >
            {editingId === u.id ? (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={draft.name}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, name: e.target.value }));
                      setDraftError(null);
                    }}
                    aria-invalid={Boolean(draftError)}
                    className="w-40"
                  />
                  <Input
                    value={draft.abbreviation}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, abbreviation: e.target.value }));
                      setDraftError(null);
                    }}
                    aria-invalid={Boolean(draftError)}
                    className="w-24"
                  />
                  <FieldError message={draftError} className="mt-0" />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => saveEdit(u)}
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
                <span className={`font-semibold ${u.active ? "" : "text-charcoal-900/40 line-through"}`}>
                  {u.name} <span className="text-charcoal-900/40">({u.abbreviation})</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleActive(u)}
                    className={activePill(u.active)}
                    title={u.active ? "Hide from the Inventory Item form without deleting" : "Make available again"}
                  >
                    {u.active ? "Active" : "Inactive"}
                  </button>
                  <button
                    onClick={() => startEdit(u)}
                    className={actionBtn("edit")}
                    aria-label={`Edit ${u.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeUnit(u)}
                    className={actionBtn("delete")}
                    aria-label={`Delete ${u.name}`}
                    title={`Delete ${u.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="px-4 py-6 text-sm text-charcoal-900/50">
            No units yet — add one above (e.g. Kilogram / kg, Piece / pc).
          </p>
        )}
      </div>
    </div>
  );
}
