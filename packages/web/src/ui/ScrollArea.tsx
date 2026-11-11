// SPDX-License-Identifier: Apache-2.0
import { ScrollArea as P } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export function ScrollArea({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof P.Root>) {
  return (
    <P.Root className={cn("relative overflow-hidden", className)} {...props}>
      <P.Viewport className="h-full w-full">{children}</P.Viewport>
      <ScrollBar />
      <P.Corner />
    </P.Root>
  );
}
export function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ComponentPropsWithoutRef<typeof P.Scrollbar>) {
  return (
    <P.Scrollbar
      orientation={orientation}
      className={cn(
        "flex touch-none select-none p-0.5",
        orientation === "vertical" ? "h-full w-2.5" : "h-2.5 flex-col",
        className,
      )}
      {...props}
    >
      <P.Thumb className="relative flex-1 rounded-full bg-border" />
    </P.Scrollbar>
  );
}
