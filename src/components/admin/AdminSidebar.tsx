"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "@/components/admin/nav";
import { cn } from "@/lib/utils";

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-white px-3 py-6">
      {ADMIN_NAV.map((group) => (
        <div key={group.section} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-charcoal-900/40">
            {group.section}
          </p>
          {group.items.map((item) => {
            // Dashboard ("/admin") only matches exactly; every other item
            // matches its own path and any sub-route under it.
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                  active
                    ? "bg-charcoal-900 text-white shadow-sm"
                    : "text-charcoal-900/80 hover:bg-rice-100"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.planned && !active && (
                  <span className="rounded-full bg-turmeric-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-achuete-700">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
