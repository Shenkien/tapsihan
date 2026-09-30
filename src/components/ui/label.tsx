"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

type LabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
  /** Shows a red * after the label. */
  required?: boolean;
  /** With `required`: swaps the red * for a green tick once the field is filled in correctly. */
  filled?: boolean;
};

const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  ({ className, required, filled, children, ...props }, ref) => (
    <LabelPrimitive.Root
      ref={ref}
      className={cn("text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    >
      {children}
      {required &&
        (filled ? (
          <span className="ml-1 font-extrabold text-emerald-600" aria-hidden>
            ✓
          </span>
        ) : (
          <span className="ml-0.5 font-extrabold text-danger" aria-hidden>
            *
          </span>
        ))}
      {required && <span className="sr-only"> (required)</span>}
    </LabelPrimitive.Root>
  )
);
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
