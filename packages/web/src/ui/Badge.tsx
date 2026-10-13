// SPDX-License-Identifier: Apache-2.0
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border border-border px-1 py-0.5 text-xs [&_svg]:size-icon-sm",
  {
    variants: {
      variant: {
        secondary: "text-muted",
        success: "text-success",
        warning: "text-warning",
        danger: "text-danger",
        accent: "text-accent",
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
