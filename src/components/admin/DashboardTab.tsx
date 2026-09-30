"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, Banknote, CheckCircle2, Minus, ShoppingBag, Smartphone, Trophy, TriangleAlert, Wallet } from "lucide-react";
import { unitLabel } from "@/lib/utils";
import type { AdminIngredient, AdminProduct } from "@/types/models";
import { fetchJson } from "@/lib/fetchJson";

type DashboardData = {
  revenue: number;
  orderCount: number;
  /** Same time window yesterday — used for the up/down arrows. */
  yesterday?: { revenue: number; orderCount: number };
  byMethod: { CASH: number; GCASH: number };
  topItems: { product: AdminProduct | undefined; qtySold: number }[];
  lowIngredients: AdminIngredient[];
};

export default function DashboardTab() {
  const [data, setData] = useState<DashboardData | null>(null);

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchJson<DashboardData>("/api/admin/dashboard").then((d) => {
      if (cancelled) return;
      if (!d || typeof d.revenue !== "number") {
        setFailed(true);
        return;
      }
      setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed)
    return (
      <p className="opacity-60">
        Couldn&apos;t load the dashboard. Your session may have expired — try reloading the page.
      </p>
    );
  if (!data) return <p className="opacity-60">Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <StatCard
          tone="green"
          icon={Wallet}
          label="Today's Revenue"
          hint="All sales today"
          value={`₱${data.revenue.toFixed(0)}`}
          compare={data.yesterday ? { current: data.revenue, previous: data.yesterday.revenue } : undefined}
        />
        <StatCard
          tone="maroon"
          icon={ShoppingBag}
          label="Orders Today"
          hint="Orders placed today"
          value={String(data.orderCount)}
          compare={data.yesterday ? { current: data.orderCount, previous: data.yesterday.orderCount } : undefined}
        />
        <StatCard
          tone="amber"
          icon={Banknote}
          label="Cash"
          hint="Paid at the counter"
          value={`₱${data.byMethod.CASH.toFixed(0)}`}
        />
        <StatCard
          tone="blue"
          icon={Smartphone}
          label="GCash"
          hint="Paid through GCash"
          value={`₱${data.byMethod.GCASH.toFixed(0)}`}
        />
      </div>

      <div>
        <SectionHeading tone="amber" icon={Trophy} title="Top Sellers Today" />
        <div className="flex flex-col gap-2">
          {data.topItems.length === 0 && <p className="opacity-60">No sales yet today.</p>}
          {data.topItems.map(
            (item, index) =>
              item.product && (
                <div
                  key={item.product.id}
                  className="flex items-center gap-3 rounded-xl border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 p-3 shadow-sm"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="flex-1">{item.product.name}</span>
                  <span className="font-bold text-amber-800">{item.qtySold} sold</span>
                </div>
              )
          )}
        </div>
      </div>

      <div>
        <SectionHeading
          tone={data.lowIngredients.length === 0 ? "green" : "red"}
          icon={data.lowIngredients.length === 0 ? CheckCircle2 : TriangleAlert}
          title="Low Stock — Inventory Items"
        />
        <div className="flex flex-col gap-2">
          {data.lowIngredients.length === 0 && (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50 p-3 text-emerald-800">
              <CheckCircle2 size={18} /> Nothing low on stock.
            </p>
          )}
          {data.lowIngredients.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-danger/20 border-l-4 border-l-danger bg-[#fbe4e1] p-3">
              <div className="flex min-w-0 flex-col">
                <span>{i.name}</span>
                <a
                  href={`/admin/purchase-orders/new?ingredient=${i.id}`}
                  className="text-xs font-semibold text-achuete-600 underline"
                >
                  {i.supplier ? `Order from ${i.supplier.name} →` : "Order →"}
                </a>
              </div>
              <span className="font-bold text-danger">
                {i.trackByPiece ? `${i.pieceStock} ${i.pieceUnitLabel}` : `${i.stock} ${unitLabel(i.unit)}`} left
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// Each colour means one thing across the dashboard: green = money in,
// maroon = the shop's own order count, amber = cash / top sellers,
// blue = GCash, red = needs attention. Class names are written out in full
// (not built from strings) so Tailwind can see and generate them.
type Tone = "green" | "maroon" | "amber" | "blue" | "red";

const TONES: Record<Tone, { card: string; chip: string; value: string; heading: string }> = {
  green: {
    card: "border-emerald-200 border-l-emerald-500 bg-emerald-50",
    chip: "bg-emerald-500 text-white",
    value: "text-emerald-700",
    heading: "bg-emerald-500 text-white",
  },
  maroon: {
    card: "border-[#e6c4c4] border-l-achuete-600 bg-[#fbeeee]",
    chip: "bg-achuete-600 text-white",
    value: "text-achuete-600",
    heading: "bg-achuete-600 text-white",
  },
  amber: {
    card: "border-amber-200 border-l-amber-500 bg-amber-50",
    chip: "bg-amber-500 text-white",
    value: "text-amber-700",
    heading: "bg-amber-500 text-white",
  },
  blue: {
    card: "border-sky-200 border-l-sky-500 bg-sky-50",
    chip: "bg-sky-500 text-white",
    value: "text-sky-700",
    heading: "bg-sky-500 text-white",
  },
  red: {
    card: "border-red-200 border-l-danger bg-[#fbe4e1]",
    chip: "bg-danger text-white",
    value: "text-danger",
    heading: "bg-danger text-white",
  },
};

function StatCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  compare,
}: {
  label: string;
  value: string;
  hint: string;
  tone: Tone;
  icon: LucideIcon;
  /** Today vs the same time yesterday — shows an up/down arrow. */
  compare?: { current: number; previous: number };
}) {
  const t = TONES[tone];
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-l-4 p-4 shadow-sm ${t.card}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${t.chip}`}>
        <Icon size={22} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-charcoal-900/80">{label}</p>
        <p className={`big-number text-2xl ${t.value}`}>{value}</p>
        <p className="text-xs text-charcoal-900/60">{hint}</p>
        {compare && <Delta current={compare.current} previous={compare.previous} />}
      </div>
    </div>
  );
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const same = current === previous;
  const up = current > previous;
  const pct = previous > 0 ? Math.round((Math.abs(current - previous) / previous) * 100) : null;
  const Icon = same ? Minus : up ? ArrowUp : ArrowDown;
  const color = same ? "text-charcoal-900/50" : up ? "text-emerald-700" : "text-danger";
  const text = same
    ? "Same as yesterday"
    : pct === null
      ? "Up from 0 yesterday"
      : `${pct}% ${up ? "up" : "down"} vs yesterday`;
  return (
    <p className={`mt-0.5 flex items-center gap-1 text-xs font-bold ${color}`}>
      <Icon size={13} />
      {text}
    </p>
  );
}

function SectionHeading({ title, tone, icon: Icon }: { title: string; tone: Tone; icon: LucideIcon }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${TONES[tone].heading}`}>
        <Icon size={16} />
      </span>
      {title}
    </h3>
  );
}
