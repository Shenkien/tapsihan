"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { AdminCombo } from "@/types/models";
import { actionBtn } from "@/components/admin/actionStyles";

export default function CombosTab() {
  const [combos, setCombos] = useState<AdminCombo[] | null>(null);
  const { toast } = useToast();

  async function load() {
    const res = await fetch("/api/admin/combos");
    if (res.ok) setCombos(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(combo: AdminCombo) {
    if (!confirm(`Remove "${combo.name}"?`)) return;
    const res = await fetch(`/api/admin/combos/${combo.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast({ title: "Could not remove combo", description: data.error, variant: "destructive" });
      return;
    }
    load();
  }

  if (!combos) return <p className="opacity-60">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Link href="/admin/combos/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> New Combo
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {combos.map((combo) => (
          <div
            key={combo.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              {combo.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={combo.imageUrl} alt={combo.name} className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-rice-100" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold">{combo.name}</p>
                  <span
                    className={
                      combo.active
                        ? "rounded-full bg-[#e7f0e5] px-2.5 py-0.5 text-xs font-bold text-[#2b4f3d]"
                        : "rounded-full bg-rice-100 px-2.5 py-0.5 text-xs font-bold text-charcoal-900/50"
                    }
                  >
                    {combo.active ? "Available" : "Unavailable"}
                  </span>
                </div>
                <p className="text-sm text-charcoal-900/60">{combo.items.map((i) => i.product.name).join(", ")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold">₱{combo.price.toFixed(2)}</span>
              <Link
                href={`/admin/combos/${combo.id}/edit`}
                className={actionBtn("edit")}
                aria-label={`Edit ${combo.name}`}
                title={`Edit ${combo.name}`}
              >
                <Pencil className="h-4 w-4" />
              </Link>
              <button
                onClick={() => handleDelete(combo)}
                className={actionBtn("delete")}
                aria-label={`Remove ${combo.name}`}
                title={`Remove ${combo.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {combos.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-charcoal-900/50">
            No combo meals yet — bundle a few menu items together to create one.
          </p>
        )}
      </div>
    </div>
  );
}
