// SPDX-License-Identifier: Apache-2.0
import type { LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "./cn";
export function PropertyList({ className, ...props }: ComponentPropsWithoutRef<"dl">) {
  return <dl className={cn("min-w-0", className)} {...props} />;
}
export function PropertyRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: definition-list rows use a div group.
    <div role="group" className="flex min-w-0 flex-wrap items-start gap-2 py-2">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        title={typeof value === "string" ? value : undefined}
        className="min-w-0 flex-1 truncate text-foreground"
      >
        {value}
      </dd>
    </div>
  );
}
