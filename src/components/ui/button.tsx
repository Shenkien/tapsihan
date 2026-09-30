import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-base font-bold transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 min-h-[56px] px-7",
  {
    variants: {
      variant: {
        primary:
          "bg-achuete-600 text-white shadow-brand hover:-translate-y-0.5 hover:bg-achuete-700 disabled:bg-charcoal-900/15 disabled:text-charcoal-900/40 disabled:opacity-100 disabled:shadow-none",
        secondary: "bg-leaf-900 text-rice-50 hover:-translate-y-0.5 hover:bg-leaf-700",
        ghost: "bg-transparent text-leaf-900 border-2 border-leaf-900 hover:bg-leaf-900/5",
        outlineLight: "bg-transparent text-rice-50 border-2 border-rice-50 hover:bg-rice-50/10",
        destructive: "bg-danger text-white hover:-translate-y-0.5 hover:opacity-90",
      },
      size: {
        default: "min-h-[56px] px-7",
        sm: "min-h-[40px] px-4 text-sm",
        icon: "min-h-[40px] w-10 px-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
