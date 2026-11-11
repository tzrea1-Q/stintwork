// SPDX-License-Identifier: Apache-2.0
import { Separator as P } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export function Separator({
  className,
  orientation = "horizontal",
  decorative = false,
  ...props
}: ComponentPropsWithoutRef<typeof P.Root>) {
  return (
    <P.Root
      orientation={orientation}
      decorative={decorative}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
