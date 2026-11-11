// SPDX-License-Identifier: Apache-2.0
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export function Kbd({ className, ...props }: ComponentPropsWithoutRef<"kbd">) {
  return (
    <kbd
      className={cn("rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}
export function KbdGroup(props: ComponentPropsWithoutRef<"div">) {
  return <div {...props} />;
}
