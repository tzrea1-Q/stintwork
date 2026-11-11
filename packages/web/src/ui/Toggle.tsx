// SPDX-License-Identifier: Apache-2.0
import { Toggle as P } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: ComponentPropsWithoutRef<typeof P.Root> & {
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
}) {
  return (
    <P.Root
      className={cn(
        "rounded-lg focus-visible:outline-ring data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
        variant === "outline" && "border border-border",
        size === "sm" ? "p-1" : size === "lg" ? "p-3" : "p-2",
        className,
      )}
      {...props}
    />
  );
}
