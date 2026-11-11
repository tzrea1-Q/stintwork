// SPDX-License-Identifier: Apache-2.0
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-1 before:size-1.5 before:shrink-0 before:rounded-full before:bg-current text-xs [&_svg]:size-icon-sm",
  {
    variants: {
      variant: {
        secondary: "bg-stopped-soft text-stopped-foreground",
        success: "bg-success-soft text-success-foreground",
        warning: "bg-attention-soft text-attention-foreground",
        danger: "bg-blocked-soft text-blocked-foreground",
        accent: "bg-running-soft text-running-foreground",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentPropsWithoutRef<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
