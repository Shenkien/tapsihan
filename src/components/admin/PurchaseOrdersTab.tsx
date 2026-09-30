"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useRowFlash } from "@/hooks/useRowFlash";
import { PO_STATUS_STYLE, formatExpected, poOverdue } from "@/components/admin/poStatus";
import type { AdminPurchaseOrder } from "@/types/models";

export default function PurchaseOrdersTab() {
  const [pos, setPos] = useState<AdminPurchaseOrder[] | null>(null);
  const [receivingId, setReceivingId] = useState<number | null>(null);
  const { flash, flashClass } = useRowFlash();
  const { toast } = useToast();

  async function load() {
    const res = await fetch("/api/admin/purchase-orders");
    if (res.ok) setPos(await res.json());
  }

  useEffect(() => {
    (async () => {
      await load();
      // Coming back from "New Purchase Order": flash the order that was just
      // created (same green flash as a saved row elsewhere), then tidy the URL.
      const highlightId = Number(new URLSearchParams(window.location.search).get("highlight"));
      if (highlightId) {
        flash(highlightId);
        window.history.replaceState(null, "", window.location.pathname);
      }
    })();
  }, []);

  async function handleReceive(po: AdminPurchaseOrder) {
    if (!confirm(`Mark ${po.poNumber} as received? This restocks every line item.`)) return;
    setReceivingId(po.id);
    const res = await fetch(`/api/admin/purchase-orders/${po.id}/receive`, { method: "POST" });
    const data = await res.json();
    setReceivingId(null);
    if (!res.ok) {
      toast({ title: "Could not receive PO", description: data.error, variant: "destructive" });
      return;
    }
    toast({ description: `${po.poNumber} received — stock updated.` });
    await load();
    flash(po.id);
  }

  if (!pos) return <p className="opacity-60">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Link href="/admin/purchase-orders/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> New Purchase Order
          </Button>
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-extrabold uppercase tracking-wide text-charcoal-900/40">
              <th className="px-4 py-3">PO #</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total cost</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Expected</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pos.map((po) => {
              const { overdue, days: daysLate } = poOverdue(po);
              return (
              <tr
                key={po.id}
                className={`border-b border-border transition-colors last:border-b-0 ${
                  overdue ? "bg-red-50 hover:bg-red-100" : "hover:bg-rice-50"
                } ${flashClass(po.id)}`}
              >
                <td className="px-4 py-3 font-semibold">{po.poNumber}</td>
                <td className="px-4 py-3">{po.supplier.name}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PO_STATUS_STYLE[po.status]}`}>
                    {po.status}
                  </span>
                  {overdue && (
                    <span className="ml-2 rounded-full bg-danger px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                      {po.expectedDate ? `Late · ${daysLate}d` : `Overdue · ${daysLate}d`}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold">₱{po.totalCost.toFixed(2)}</td>
                <td className="px-4 py-3 text-charcoal-900/60">
                  {new Date(po.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                </td>
                <td className="px-4 py-3 text-charcoal-900/60">
                  {po.expectedDate ? formatExpected(po.expectedDate) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {po.status === "ORDERED" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                      disabled={receivingId === po.id}
                      onClick={() => handleReceive(po)}
                    >
                      <PackageCheck className="h-4 w-4" />
                      {receivingId === po.id ? "Receiving…" : "Receive"}
                    </Button>
                  ) : (
                    <span className="text-xs text-charcoal-900/40">
                      {po.receivedAt &&
                        new Date(po.receivedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {pos.length === 0 && (
          <p className="px-4 py-6 text-sm text-charcoal-900/50">No purchase orders yet — create one to restock from a supplier.</p>
        )}
      </div>
    </div>
  );
}
