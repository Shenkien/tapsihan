import { cn } from "@/lib/utils";

/** The red message that sits directly under a field that failed validation. */
export function FieldError({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("mt-1 text-xs font-semibold text-danger", className)}>
      {message}
    </p>
  );
}

/** The small "Unsaved changes" tag shown next to a Save button once something has been edited. */
export function UnsavedBadge() {
  return (
    <span className="rounded-full bg-turmeric-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-achuete-700">
      Unsaved changes
    </span>
  );
}
