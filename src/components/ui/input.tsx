import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-xl border border-border bg-white px-3 py-2 text-base text-charcoal-900 placeholder:text-charcoal-900/40 transition-colors focus-visible:border-achuete-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-achuete-600/30 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:border-danger aria-[invalid=true]:bg-red-50 aria-[invalid=true]:focus-visible:ring-danger/30",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
