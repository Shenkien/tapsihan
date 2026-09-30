"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, UnsavedBadge } from "@/components/ui/field-error";
import { emailError, nameError, optionalNameError, phoneError } from "@/lib/formRules";
import { useRowFlash } from "@/hooks/useRowFlash";
import { useToast } from "@/hooks/use-toast";
import { unitLabel } from "@/lib/utils";
import { PO_STATUS_STYLE, formatExpected, poOverdue } from "@/components/admin/poStatus";
import type { AdminSupplier } from "@/types/models";
import { actionBtn } from "@/components/admin/actionStyles";

const EMPTY = { name: "", contactPerson: "", phone: "", email: "" };

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<AdminSupplier[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { flash, flashClass } = useRowFlash();
  const { toast } = useToast();

  function setField(key: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // The form is "dirty" when it differs from a blank form (adding) or from
  // the supplier being edited.
  const editingSupplier = editingId ? suppliers?.find((s) => s.id === editingId) : undefined;
  const baseForm = editingSupplier
    ? {
        name: editingSupplier.name,
        contactPerson: editingSupplier.contactPerson ?? "",
        phone: editingSupplier.phone ?? "",
        email: editingSupplier.email ?? "",
      }
    : EMPTY;
  const dirty = JSON.stringify(form) !== JSON.stringify(baseForm);

  async function load() {
    const res = await fetch("/api/admin/suppliers");
    if (res.ok) setSuppliers(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(s: AdminSupplier) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setErrors({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const nameProblem = nameError(form.name, "Supplier name");
    if (nameProblem) next.name = nameProblem;
    const contactProblem = optionalNameError(form.contactPerson, "Contact person");
    if (contactProblem) next.contactPerson = contactProblem;
    const phoneProblem = phoneError(form.phone);
    if (phoneProblem) next.phone = phoneProblem;
    const emailProblem = emailError(form.email);
    if (emailProblem) next.email = emailProblem;
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast({ title: "Please fix the highlighted fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contactPerson: form.contactPerson.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    };
    const res = await fetch(editingId ? `/api/admin/suppliers/${editingId}` : "/api/admin/suppliers", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Could not save supplier", description: data.error, variant: "destructive" });
      return;
    }
    const savedId: number | undefined = editingId ?? data?.id;
    cancelEdit();
    await load();
    if (savedId) flash(savedId);
  }

  async function handleDelete(s: AdminSupplier) {
    if (!confirm(`Remove "${s.name}"?`)) return;
    const res = await fetch(`/api/admin/suppliers/${s.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: "Could not remove supplier", description: data.error, variant: "destructive" });
      return;
    }
    load();
  }

  if (!suppliers) return <p className="opacity-60">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm ${
          editingId ? "border-sky-300 ring-2 ring-sky-100" : "border-border"
        }`}
      >
        {editingId && (
          <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Editing {editingSupplier?.name}</p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-name" required filled={!errors.name && form.name.trim().length > 0}>
              Supplier name
            </Label>
            <Input
              id="supplier-name"
              placeholder="e.g. Aling Rosa Meat Shop"
              value={form.name}
              aria-invalid={Boolean(errors.name)}
              onChange={(e) => setField("name", e.target.value)}
            />
            <FieldError message={errors.name} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-contact">
              Contact person <span className="font-normal text-charcoal-900/40">optional</span>
            </Label>
            <Input
              id="supplier-contact"
              placeholder="e.g. Rosa Dela Cruz"
              value={form.contactPerson}
              aria-invalid={Boolean(errors.contactPerson)}
              onChange={(e) => setField("contactPerson", e.target.value)}
            />
            <FieldError message={errors.contactPerson} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-phone">
              Phone <span className="font-normal text-charcoal-900/40">optional · numbers only</span>
            </Label>
            <Input
              id="supplier-phone"
              placeholder="09171234567"
              value={form.phone}
              inputMode="numeric"
              maxLength={11}
              aria-invalid={Boolean(errors.phone)}
              onChange={(e) => setField("phone", e.target.value.replace(/\D/g, ""))}
            />
            <FieldError message={errors.phone} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-email">
              Email <span className="font-normal text-charcoal-900/40">optional</span>
            </Label>
            <Input
              id="supplier-email"
              placeholder="name@example.com"
              type="email"
              value={form.email}
              aria-invalid={Boolean(errors.email)}
              onChange={(e) => setField("email", e.target.value)}
            />
            <FieldError message={errors.email} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={saving || (Boolean(editingId) && !dirty)}>
            {saving ? "Saving…" : editingId ? "Save Changes" : "Add Supplier"}
          </Button>
          {editingId && (
            <Button type="button" variant="ghost" onClick={cancelEdit}>
              Cancel
            </Button>
          )}
          {dirty && <UnsavedBadge />}
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {suppliers.map((s) => (
          <div
            key={s.id}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:bg-rice-50 ${
              editingId === s.id ? "border-sky-300 ring-2 ring-sky-100" : "border-border"
            } ${flashClass(s.id)}`}
          >
            <div>
              <p className="font-bold">{s.name}</p>
              <p className="text-sm text-charcoal-900/60">
                {[s.contactPerson, s.phone, s.email].filter(Boolean).join(" · ") || "No contact details yet"}
              </p>
              {s.purchaseOrders?.[0] && (
                <p className="mt-0.5 text-xs text-charcoal-900/50">
                  Last order: {shortDate(s.purchaseOrders[0].createdAt)} · ₱{s.purchaseOrders[0].totalCost.toFixed(2)} ·{" "}
                  {s.purchaseOrders[0].status.toLowerCase()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                aria-expanded={expandedId === s.id}
                className="flex items-center gap-1 rounded-full bg-rice-100 px-3 py-1 text-xs font-bold text-charcoal-900/60 hover:bg-rice-200"
              >
                {s._count?.purchaseOrders ?? 0} POs
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedId === s.id ? "rotate-180" : ""}`} />
              </button>
              <button
                onClick={() => startEdit(s)}
                className={actionBtn("edit")}
                aria-label={`Edit ${s.name}`}
                title={`Edit ${s.name}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDelete(s)}
                className={actionBtn("delete")}
                aria-label={`Remove ${s.name}`}
                title={`Remove ${s.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {expandedId === s.id && (
              <div className="flex w-full basis-full flex-col gap-2 border-t border-border pt-3">
                {(s.purchaseOrders ?? []).length === 0 ? (
                  <p className="text-sm text-charcoal-900/50">No orders from this supplier yet.</p>
                ) : (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wide text-charcoal-900/50">
                      Recent orders{(s._count?.purchaseOrders ?? 0) > 5 ? " (last 5)" : ""}
                    </p>
                    {(s.purchaseOrders ?? []).map((po) => {
                      const { overdue, days: daysLate } = poOverdue(po);
                      return (
                      <div
                        key={po.id}
                        className={`flex flex-wrap items-start justify-between gap-2 rounded-xl px-3 py-2 ${
                          overdue ? "bg-red-50" : "bg-rice-50"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {po.poNumber} <span className="font-normal text-charcoal-900/50">· {shortDate(po.createdAt)}</span>
                            {po.status === "ORDERED" && po.expectedDate && (
                              <span className="font-normal text-charcoal-900/50"> · due {formatExpected(po.expectedDate)}</span>
                            )}
                          </p>
                          <p className="text-sm text-charcoal-900/70">
                            {po.items.map((it) => `${it.ingredient.name} ${it.qty} ${unitLabel(it.ingredient.unit)}`).join(", ")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">₱{po.totalCost.toFixed(2)}</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PO_STATUS_STYLE[po.status]}`}>
                            {po.status}
                          </span>
                          {overdue && (
                            <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                              {po.expectedDate ? `Late · ${daysLate}d` : `Overdue · ${daysLate}d`}
                            </span>
                          )}
                          <Link
                            href={`/admin/purchase-orders/new?reorder=${po.id}`}
                            className="flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-bold hover:bg-rice-100"
                            title="Start a new order with the same supplier and items"
                          >
                            <RotateCcw className="h-3 w-3" /> Reorder
                          </Link>
                        </div>
                      </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {suppliers.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-charcoal-900/50">
            No suppliers yet — add who you buy ingredients from.
          </p>
        )}
      </div>
    </div>
  );
}
