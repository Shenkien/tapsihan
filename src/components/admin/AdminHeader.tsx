"use client";

import AccountMenu from "@/components/AccountMenu";

// Header background pattern + badge icon are real generated SVG assets
// (see /public/assets), not CSS-drawn shapes — keeps them crisp and lets
// them be swapped independently of this component. Spacing below matches
// the reference mockup's spec: 72px header, 24px side padding, 36px badge,
// 24px gaps around the divider, 12px between the account menu and Log out.
export default function AdminHeader() {
  return (
    <header className="relative flex h-[72px] items-center justify-between overflow-hidden bg-achuete-700 px-6 text-rice-50 shadow-md">
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage: "url(/assets/patterns/header-pattern.svg)",
          backgroundRepeat: "repeat",
          backgroundSize: "300px 169px",
        }}
        aria-hidden
      />

      <div className="relative flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <img src="/assets/brand/logo-icon.png" alt="Tapsihan" className="h-9 w-9 shrink-0" />
          <div className="-skew-x-6 leading-[0.95]">
            <div className="font-marker text-lg text-rice-50">KUY&apos;S</div>
            <div className="-mt-1 font-marker text-lg text-turmeric-500">TAPSIHAN</div>
          </div>
        </div>

        <div className="h-8 w-px bg-[#8b0000]" />

        <span className="hidden text-xs font-bold uppercase tracking-[0.2em] text-rice-50/80 sm:inline">
          Smart Ordering System
        </span>
      </div>

      <div className="relative flex items-center gap-3">
        <AccountMenu loginPath="/login" />
      </div>
    </header>
  );
}
