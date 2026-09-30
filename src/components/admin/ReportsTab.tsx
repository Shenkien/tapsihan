"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Banknote, Clock, ShoppingBag, Smartphone, TrendingUp, Trophy, Utensils, Wallet } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchJson } from "@/lib/fetchJson";

type ReportData = {
  period: string;
  revenue: number;
  orderCount: number;
  avgOrderValue: number;
  byMethod: { CASH: number; GCASH: number };
  byType: { DINE_IN: number; TAKEOUT: number };
  byChannel: { KIOSK: number; QR: number; COUNTER: number };
  peakHour: number | null;
  byItem: Record<string, { qty: number; revenue: number }>;
};

function formatHour(hour: number) {
  const suffix = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${suffix}`;
}

export default function ReportsTab() {
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [data, setData] = useState<ReportData | null>(null);

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetchJson<ReportData>(`/api/admin/reports?period=${period}`).then((d) => {
      if (cancelled) return;
      if (!d) {
        setData(null);
        setFailed(true);
        return;
      }
      setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="flex flex-col gap-6">
      <Tabs value={period} onValueChange={(v) => setPeriod(v as "daily" | "weekly")}>
        <TabsList>
          <TabsTrigger value="daily">Last 24 hours</TabsTrigger>
          <TabsTrigger value="weekly">Last 7 days</TabsTrigger>
        </TabsList>
      </Tabs>

      {failed && (
        <p className="text-sm opacity-60">
          Couldn&apos;t load this report. Your session may have expired — try reloading the page.
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <StatCard tone="green" icon={Wallet} label="Revenue" value={`₱${data.revenue.toFixed(0)}`} />
            <StatCard tone="maroon" icon={ShoppingBag} label="Orders" value={String(data.orderCount)} />
            <StatCard
              tone="amber"
              icon={Banknote}
              label="Cash / GCash"
              small
              value={`₱${data.byMethod.CASH.toFixed(0)} / ₱${data.byMethod.GCASH.toFixed(0)}`}
            />
            <StatCard tone="blue" icon={TrendingUp} label="Avg. order value" value={`₱${data.avgOrderValue.toFixed(0)}`} />
            <StatCard
              tone="maroon"
              icon={Clock}
              label="Peak hour"
              value={data.peakHour === null ? "—" : formatHour(data.peakHour)}
            />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            <StatCard
              tone="amber"
              icon={Utensils}
              label="Dine-in / Takeout"
              small
              value={`₱${data.byType.DINE_IN.toFixed(0)} / ₱${data.byType.TAKEOUT.toFixed(0)}`}
            />
            <StatCard
              tone="blue"
              icon={Smartphone}
              label="Kiosk / QR / Counter"
              small
              value={`₱${data.byChannel.KIOSK.toFixed(0)} / ₱${data.byChannel.QR.toFixed(0)} / ₱${data.byChannel.COUNTER.toFixed(0)}`}
            />
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white">
                <Trophy size={16} />
              </span>
              Sales by item
            </h3>
            <div className="flex flex-col gap-2">
              {(() => {
                const sorted = Object.entries(data.byItem).sort((a, b) => b[1].qty - a[1].qty);
                // Only call out a lowest seller when there are enough items to compare.
                return sorted.map(([name, stats], index) => {
                  const isTop = index === 0;
                  const isLowest = sorted.length >= 3 && index === sorted.length - 1;
                  return (
                    <div
                      key={name}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-3 shadow-sm ${
                        isTop
                          ? "border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50"
                          : isLowest
                            ? "border-red-200 border-l-4 border-l-danger bg-red-50"
                            : "border-border bg-white"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {name}
                        {isTop && (
                          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                            Top seller
                          </span>
                        )}
                        {isLowest && (
                          <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                            Lowest
                          </span>
                        )}
                      </span>
                      <span className="font-bold">
                        {stats.qty} sold · ₱{stats.revenue.toFixed(0)}
                      </span>
                    </div>
                  );
                });
              })()}
              {Object.keys(data.byItem).length === 0 && (
                <p className="opacity-60">
                  No sales in this period yet — figures only count orders once they&apos;re paid (not still
                  &quot;Created&quot;).
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Same colour scheme as the Dashboard cards: green = money in, maroon = orders,
// amber = cash / totals by type, blue = GCash / channels. Class names are
// written out in full so Tailwind can generate them.
type Tone = "green" | "maroon" | "amber" | "blue";

const TONES: Record<Tone, { card: string; chip: string; value: string }> = {
  green: { card: "border-emerald-200 border-l-emerald-500 bg-emerald-50", chip: "bg-emerald-500 text-white", value: "text-emerald-700" },
  maroon: { card: "border-[#e6c4c4] border-l-achuete-600 bg-[#fbeeee]", chip: "bg-achuete-600 text-white", value: "text-achuete-600" },
  amber: { card: "border-amber-200 border-l-amber-500 bg-amber-50", chip: "bg-amber-500 text-white", value: "text-amber-700" },
  blue: { card: "border-sky-200 border-l-sky-500 bg-sky-50", chip: "bg-sky-500 text-white", value: "text-sky-700" },
};

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
  small = false,
}: {
  label: string;
  value: string;
  tone: Tone;
  icon: LucideIcon;
  small?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-l-4 p-4 shadow-sm ${t.card}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${t.chip}`}>
        <Icon size={22} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-charcoal-900/80">{label}</p>
        <p className={`big-number ${small ? "text-lg" : "text-2xl"} ${t.value}`}>{value}</p>
      </div>
    </div>
  );
}
