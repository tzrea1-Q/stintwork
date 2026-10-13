// SPDX-License-Identifier: Apache-2.0
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-icon-sm",
  {
    variants: {
      variant: {
        primary: "border-transparent bg-accent text-on-accent hover:opacity-90",
        secondary: "border-border bg-surface text-text hover:bg-surface-hover",
        ghost:
          "border-transparent bg-transparent text-muted hover:bg-surface-hover hover:text-text",
        danger: "border-transparent bg-danger text-on-danger hover:opacity-90",
      },
      size: { sm: "h-7 px-2", md: "h-8 px-3", lg: "h-10 px-4", icon: "size-8" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export const Button = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }
>(function Button({ asChild, variant, size, className, type, ...props }, ref) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      ref={ref}
      type={asChild ? type : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
