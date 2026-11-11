// SPDX-License-Identifier: Apache-2.0
import { ToggleGroup as P } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export const ToggleGroup = P.Root;
export function ToggleGroupItem({ className, ...props }: ComponentPropsWithoutRef<typeof P.Item>) {
  return (
    <P.Item
      className={cn(
        "rounded-lg p-2 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
