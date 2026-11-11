// SPDX-License-Identifier: Apache-2.0
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export function Empty({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn("flex flex-col items-center gap-4 rounded-xl p-6 text-center", className)}
      {...props}
    />
  );
}
export function EmptyHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="emptyheader"
      className={cn("flex flex-col items-center gap-2", className)}
      {...props}
    />
  );
}
export function EmptyMedia({
  className,
  variant = "default",
  ...props
}: ComponentPropsWithoutRef<"div"> & { variant?: "default" | "icon" }) {
  return (
    <div
      data-slot="emptymedia"
      className={cn(
        "flex shrink-0 items-center justify-center",
        variant === "icon" && "size-10 rounded-lg bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function EmptyTitle({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="emptytitle" className={cn("font-semibold", className)} {...props} />;
}
export function EmptyDescription({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="emptydescription"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
export function EmptyContent({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="emptycontent"
      className={cn("flex w-full flex-col items-center gap-4", className)}
      {...props}
    />
  );
}
