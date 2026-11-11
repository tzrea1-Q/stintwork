// SPDX-License-Identifier: Apache-2.0
import { Progress as P } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export function Progress({
  className,
  value,
  max = 100,
  ...props
}: ComponentPropsWithoutRef<typeof P.Root>) {
  return (
    <P.Root
      className={cn("relative h-2 overflow-hidden rounded-full bg-muted", className)}
      value={value}
      max={max}
      {...props}
    >
      <P.Indicator
        className="h-full bg-primary"
        style={{ width: `${((value ?? 0) / max) * 100}%` }}
      />
    </P.Root>
  );
}
