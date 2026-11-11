// SPDX-License-Identifier: Apache-2.0
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-2xl border border-border bg-card text-card-foreground shadow-card",
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div data-slot="cardheader" className={cn("flex flex-col gap-2 p-6", className)} {...props} />
  );
}
export function CardTitle({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="cardtitle" className={cn("font-semibold", className)} {...props} />;
}
export function CardDescription({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="carddescription"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
export function CardAction({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="cardaction" className={cn("self-start", className)} {...props} />;
}
export function CardContent({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="cardcontent" className={cn("px-6", className)} {...props} />;
}
export function CardFooter({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div data-slot="cardfooter" className={cn("flex items-center p-6", className)} {...props} />
  );
}
