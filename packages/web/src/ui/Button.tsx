// SPDX-License-Identifier: Apache-2.0

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "./cn";

const buttonVariants = cva(
  "inline-flex max-w-full shrink-0 items-center justify-center gap-2 whitespace-normal border text-sm font-medium [overflow-wrap:anywhere] transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-icon-sm",
  {
    variants: {
      variant: {
        primary: "border-transparent bg-primary text-primary-foreground hover:opacity-90",
        secondary: "border-border bg-card text-foreground hover:bg-secondary",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
        link: "border-transparent bg-transparent text-foreground hover:text-accent-foreground",
        danger: "border-transparent bg-destructive text-destructive-foreground hover:opacity-90",
      },
      size: {
        sm: "min-h-7 rounded-[14px] px-2 py-1",
        md: "min-h-8 rounded-[16px] px-3 py-1",
        lg: "min-h-10 rounded-[20px] px-4 py-2",
        icon: "size-8 rounded-full",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export const Button = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }
>(function Button({ asChild, variant, size, className, type, ...props }, ref) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      ref={ref}
      type={asChild ? type : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
