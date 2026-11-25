// SPDX-License-Identifier: Apache-2.0
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "./cn";

export const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<"input">>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "w-full min-w-0 rounded-xl border border-input bg-card p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
