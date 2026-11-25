// SPDX-License-Identifier: Apache-2.0
import { ChevronRight } from "lucide-react";
import { type ComponentPropsWithoutRef, type ReactNode, isValidElement, useState } from "react";
import { cn } from "./cn";

export function Disclosure({
  label,
  children,
  className,
  onToggle,
  ...props
}: ComponentPropsWithoutRef<"details"> & { label: ReactNode }) {
  const [expanded, setExpanded] = useState(!!props.open);
  return (
    <details
      {...props}
      onToggle={(event) => {
        setExpanded(event.currentTarget.open);
        onToggle?.(event);
      }}
      className={cn("group/disclosure min-w-0", className)}
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: summary is the native disclosure trigger; its explicit role exposes it consistently. */}
      <summary
        role={isValidElement(label) && label.type === "button" ? undefined : "button"}
        aria-expanded={isValidElement(label) && label.type === "button" ? undefined : expanded}
        className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
      >
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
