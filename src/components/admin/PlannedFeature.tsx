import type { LucideIcon } from "lucide-react";

export default function PlannedFeature({
  icon: Icon,
  whatItDoes,
  needsToShip,
}: {
  icon: LucideIcon;
  /** One sentence: what this screen will let staff/admin do. */
  whatItDoes: string;
  /** Short bullet list: what has to be built before this goes live. */
  needsToShip: string[];
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-white px-6 py-14 text-center shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rice-100 text-achuete-600">
        <Icon className="h-7 w-7" />
      </div>
      <div className="max-w-md">
        <p className="font-display text-lg font-bold text-charcoal-900">Not built yet</p>
        <p className="mt-1 text-sm text-charcoal-900/60">{whatItDoes}</p>
      </div>
      <div className="w-full max-w-md rounded-xl bg-rice-100 p-4 text-left">
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-charcoal-900/50">
          To make this real
        </p>
        <ul className="flex flex-col gap-1.5 text-sm text-charcoal-900/70">
          {needsToShip.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-achuete-600" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
