// SPDX-License-Identifier: Apache-2.0
import { Avatar as P } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export function Avatar({ className, ...props }: ComponentPropsWithoutRef<typeof P.Root>) {
  return (
    <P.Root
      className={cn(
        "relative inline-flex size-10 shrink-0 overflow-hidden rounded-full",
        className,
      )}
      {...props}
    />
  );
}
export const AvatarImage = P.Image;
export function AvatarFallback({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof P.Fallback>) {
  return (
    <P.Fallback
      className={cn("flex size-full items-center justify-center rounded-full bg-muted", className)}
      {...props}
    />
  );
}
