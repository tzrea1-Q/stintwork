// SPDX-License-Identifier: Apache-2.0
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";

export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithoutRef<"input">, "type">
>(function Checkbox({ className, ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      className={cn(
        "size-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed",
        className,
      )}
    />
  );
});
