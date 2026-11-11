// SPDX-License-Identifier: Apache-2.0
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { statusColors, type Status } from "./StatusChip";
export function IconChip({
  icon: Icon,
  tone = "neutral",
  label,
}: {
  icon: LucideIcon;
  tone?: Status | "accent" | "neutral";
  label?: string;
}) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the label is present only with role img.
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
        tone === "accent"
          ? "bg-accent text-accent-foreground"
          : tone === "neutral"
            ? statusColors.stopped
            : statusColors[tone],
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </span>
  );
}
