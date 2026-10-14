// SPDX-License-Identifier: Apache-2.0
import { ChevronRight } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "./cn";

export function Disclosure({
  label,
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"details"> & { label: ReactNode }) {
  return (
    <details {...props} className={cn("group/disclosure min-w-0", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-icon-sm shrink-0 group-open/disclosure:rotate-90"
          aria-hidden="true"
        />
        {label}
      </summary>
      {children}
    </details>
  );
}
