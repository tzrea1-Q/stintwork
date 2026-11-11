// SPDX-License-Identifier: Apache-2.0
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export function Skeleton({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn("motion-safe:animate-pulse rounded-md bg-muted", className)}
    />
  );
}
