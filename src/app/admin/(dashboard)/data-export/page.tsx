import { Download } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";

const EXPORTS = [
  {
    title: "Orders (Sales History)",
    description: "Every order, its totals, and payment status.",
    href: "/api/admin/reports/export.csv",
  },
  {
    title: "Inventory & Valuation",
    description: "Current stock levels, unit cost, and total value per item.",
    href: "/api/admin/export/inventory.csv",
  },
  {
    title: "Menu Items",
    description: "Menu items, category, price, and availability.",
    href: "/api/admin/export/menu.csv",
  },
  {
    title: "Purchase Orders",
    description: "Every PO raised — supplier, status, total cost, and dates.",
    href: "/api/admin/export/purchase-orders.csv",
  },
  {
    title: "Suppliers",
    description: "Your supplier directory — contact person, phone, and email.",
    href: "/api/admin/export/suppliers.csv",
  },
];

export default function DataExportPage() {
  return (
    <>
      <PageHeader
        title="Data Export"
        description="Download a CSV snapshot of your data — for backups, or to open in Excel/Google Sheets."
      />
      <div className="flex flex-col gap-3">
        {EXPORTS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-brand"
          >
            <div>
              <p className="font-bold">{item.title}</p>
              <p className="text-sm text-charcoal-900/60">{item.description}</p>
            </div>
            <Download className="h-5 w-5 shrink-0 text-achuete-600" />
          </a>
        ))}
      </div>
    </>
  );
}
