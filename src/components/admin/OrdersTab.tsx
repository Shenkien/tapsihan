"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { OrderRecord } from "@/types/models";
import { fetchJson } from "@/lib/fetchJson";

const STATUS_STYLE: Record<OrderRecord["status"], string> = {
  CREATED: "bg-rice-100 text-charcoal-900/60",
  PAID: "bg-[#fdf1d9] text-[#8a5a00]",
  READY: "bg-[#e2ecf7] text-[#28527a]",
  COMPLETED: "bg-[#e7f0e5] text-[#2b4f3d]",
  CANCELLED: "bg-rice-100 text-charcoal-900/40 line-through",
};

const CHANNEL_LABEL: Record<string, string> = {
  KIOSK: "Kiosk",
  QR: "QR",
  COUNTER: "Counter",
};

export default function OrdersTab() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // The debounce timer gets cleared on re-run, but a request already in
    // flight did not — so an older, slower search could resolve last and
    // overwrite the newer results. `cancelled` closes that.
    let cancelled = false;
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (channel !== "all") params.set("source", channel);
      if (status !== "all") params.set("status", status);
      if (paymentStatus !== "all") params.set("paymentStatus", paymentStatus);
      setFailed(false);
      fetchJson<OrderRecord[]>(`/api/admin/orders?${params.toString()}`).then((data) => {
        if (cancelled) return;
        if (!data || !Array.isArray(data)) {
          setOrders([]);
          setFailed(true);
          return;
        }
        setOrders(data);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [search, channel, status, paymentStatus]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #..."
            className="pl-9"
          />
        </div>
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger>
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="KIOSK">Kiosk</SelectItem>
            <SelectItem value="QR">QR</SelectItem>
            <SelectItem value="COUNTER">Counter</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="CREATED">Created</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="READY">Ready</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentStatus} onValueChange={setPaymentStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Payment status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment statuses</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-charcoal-900/50">
          {orders.length} {orders.length === 1 ? "order" : "orders"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-extrabold uppercase tracking-wide text-charcoal-900/40">
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const isPaid = Boolean(order.payment?.paidAt);
              const cancelled = order.status === "CANCELLED";
              // Cancelled rows fade to gray; anything else still unpaid gets an
              // amber tint so it stands out in a long list.
              const rowTone = cancelled
                ? "bg-charcoal-900/5 text-charcoal-900/40"
                : !isPaid
                  ? "bg-amber-50 hover:bg-amber-100"
                  : "hover:bg-rice-50";
              return (
                <tr key={order.id} className={`border-b border-border transition-colors last:border-b-0 ${rowTone}`}>
                  <td className="px-4 py-3 font-semibold">{order.orderNo}</td>
                  <td className="px-4 py-3 text-charcoal-900/70">{CHANNEL_LABEL[order.source] ?? order.source}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[order.status]}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        isPaid ? "bg-[#e7f0e5] text-[#2b4f3d]" : "bg-[#fdf1d9] text-[#8a5a00]"
                      }`}
                    >
                      {isPaid ? "PAID" : "UNPAID"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">₱{order.total.toFixed(2)}</td>
                  <td className="px-4 py-3 text-charcoal-900/60">
                    {new Date(order.createdAt).toLocaleString("en-PH", {
                      month: "numeric",
                      day: "numeric",
                      year: "2-digit",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {orders.length === 0 && (
          <p className="px-4 py-6 text-sm text-charcoal-900/50">
            {failed
              ? "Couldn\u2019t load orders. Your session may have expired — try reloading the page."
              : "No orders match these filters."}
          </p>
        )}
      </div>
    </div>
  );
}
