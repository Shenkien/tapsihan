import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Tags,
  UtensilsCrossed,
  Beef,
  ClipboardList,
  Truck,
  FileText,
  History,
  TrendingUp,
  Users,
  ShieldCheck,
  Download,
  Ruler,
  CreditCard,
  QrCode,
  Percent,
} from "lucide-react";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown when the feature isn't wired up to real data yet. */
  planned?: boolean;
};

export type AdminNavSection = {
  section: string;
  /** Step number shown before the label, e.g. "1." — omit for sections
   *  that aren't part of the core buy-to-sell workflow (Overview, System
   *  Settings). */
  step?: number;
  items: AdminNavItem[];
};

// Ordered the way the business actually runs: buy ingredients from a
// Supplier -> raise a Purchase Order -> receive the delivery (stock goes
// up) -> build the menu around what's in stock -> sell across channels ->
// review sales -> everything else lives under System Settings.
//
// Labels/grouping only — every href below points at the exact same page
// it always did. Nothing was removed; this only renames and re-sorts.
export const ADMIN_NAV: AdminNavSection[] = [
  {
    section: "Overview",
    items: [{ label: "Dashboard", href: "/admin", icon: LayoutGrid }],
  },
  {
    section: "Inventory & Supply",
    step: 1,
    items: [
      { label: "Suppliers", href: "/admin/suppliers", icon: Truck },
      { label: "Purchase Orders", href: "/admin/purchase-orders", icon: FileText },
      { label: "Inventory Items", href: "/admin/ingredients", icon: Beef },
      { label: "Units of Measure", href: "/admin/units", icon: Ruler },
      { label: "Recipes", href: "/admin/recipes", icon: ClipboardList },
    ],
  },
  {
    section: "Menu & Digital Channels",
    step: 2,
    items: [
      { label: "Menu Items", href: "/admin/menu", icon: UtensilsCrossed },
      { label: "Categories", href: "/admin/categories", icon: Tags },
      { label: "QR Ordering", href: "/admin/qr-ordering", icon: QrCode },
    ],
  },
  {
    section: "Sales & Operations",
    step: 3,
    items: [
      { label: "Order History", href: "/admin/orders", icon: History },
      { label: "Discounts", href: "/admin/discounts", icon: Percent },
      { label: "Sales Reports", href: "/admin/reports", icon: TrendingUp },
    ],
  },
  {
    section: "System Settings",
    items: [
      { label: "Payment Methods", href: "/admin/gcash-payment", icon: CreditCard },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Audit Log", href: "/admin/audit-log", icon: ShieldCheck },
      { label: "Data Export", href: "/admin/data-export", icon: Download },
    ],
  },
];
