// SPDX-License-Identifier: Apache-2.0
import { Slot } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export function Item({
  className,
  asChild = false,
  variant = "default",
  size = "default",
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  asChild?: boolean;
  variant?: "default" | "outline" | "muted";
  size?: "default" | "sm" | "xs";
}) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="item"
      className={cn(
        "flex items-center gap-4 rounded-xl",
        variant === "outline" && "border border-border",
        variant === "muted" && "bg-muted",
        size === "default" ? "p-4" : size === "sm" ? "p-3" : "p-2",
        className,
      )}
      {...props}
    />
  );
}
export function ItemGroup({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="itemgroup" className={cn("flex flex-col", className)} {...props} />;
}
export function ItemMedia({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="itemmedia"
      className={cn("flex shrink-0 items-center justify-center", className)}
      {...props}
    />
  );
}
export function ItemContent({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="itemcontent"
      className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}
      {...props}
    />
  );
}
export function ItemTitle({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="itemtitle" className={cn("font-medium", className)} {...props} />;
}
export function ItemDescription({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="itemdescription"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
export function ItemActions({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div data-slot="itemactions" className={cn("flex items-center gap-2", className)} {...props} />
  );
}
export function ItemHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="itemheader"
      className={cn("flex w-full items-center justify-between", className)}
      {...props}
    />
  );
}
export function ItemFooter({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="itemfooter"
      className={cn("flex w-full items-center justify-between", className)}
      {...props}
    />
  );
}
export function ItemSeparator(props: ComponentPropsWithoutRef<"hr">) {
  return <hr {...props} />;
}
