"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { History } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchJson } from "@/lib/fetchJson";

type AuditEntry = {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  description: string;
  actorName: string;
  actorId: number | null;
  createdAt: string;
};

// Kept in sync with the entityType values actually written by logAudit()
// calls across the app (see src/lib/services/audit.ts usages) — add to
// this list whenever a new route starts logging a new entity type.
const ENTITY_TYPES = [
  { value: "Staff", label: "User accounts" },
  { value: "Auth", label: "Sign-ins & security" },
  { value: "Product", label: "Menu items" },
  { value: "PurchaseOrder", label: "Purchase orders" },
];

// Colour the action badge by what it does, so risky changes stand out when scanning.
function actionTone(action: string): "danger" | "warn" | "ok" | "neutral" {
  const a = action.toLowerCase();
  if (/delete|remove|deactivate|cancel|decline|lockout/.test(a)) return "danger";
  if (/reset|price|adjust|waste|reauth_failed|change_password/.test(a)) return "warn";
  if (/create|receive|restock|reactivate/.test(a)) return "ok";
  return "neutral";
}

const ACTION_BADGE = {
  danger: "bg-danger text-white",
  warn: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-100 text-emerald-800",
  neutral: "bg-rice-100 text-charcoal-900/70",
};

export default function AuditLogTab() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [entityType, setEntityType] = useState<string>("all");

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // `cancelled` guards against a slow response for an old filter landing
    // after a newer one and overwriting it.
    let cancelled = false;
    const params = new URLSearchParams();
    if (entityType !== "all") params.set("entityType", entityType);
    setFailed(false);
    fetchJson<AuditEntry[]>(`/api/admin/audit-log?${params.toString()}`).then((data) => {
      if (cancelled) return;
      if (!data || !Array.isArray(data)) {
        setEntries([]);
        setFailed(true);
        return;
      }
      setEntries(data);
    });
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger>
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entity types</SelectItem>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-charcoal-900/50">
          {entries ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}` : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-extrabold uppercase tracking-wide text-charcoal-900/40">
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {entries?.map((e) => {
              const tone = actionTone(e.action);
              return (
              <tr
                key={e.id}
                className={`border-b border-border transition-colors last:border-b-0 ${
                  tone === "danger" ? "bg-red-50 hover:bg-red-100" : "hover:bg-rice-50"
                }`}
              >
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ACTION_BADGE[tone]}`}>{e.action}</span>
                </td>
                <td className="px-4 py-3">{e.description}</td>
                <td
                  className="px-4 py-3 text-charcoal-900/60"
                  title={e.actorId ? `Account #${e.actorId}` : undefined}
                >
                  {e.actorName}
                </td>
                <td className="px-4 py-3 text-charcoal-900/60">
                  {format(new Date(e.createdAt), "MMM d, h:mm a")}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {entries?.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <History className="h-8 w-8 text-charcoal-900/30" />
            <p className="text-sm text-charcoal-900/50">
              {failed
                ? "Couldn\u2019t load the audit log. Your session may have expired — try reloading the page."
                : "No audit entries yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
