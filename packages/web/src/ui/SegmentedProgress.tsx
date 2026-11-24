// SPDX-License-Identifier: Apache-2.0
import { m } from "motion/react";
import { spring, useReducedMotionSafe } from "./motion";
import { cn } from "./cn";
import type { Status } from "./StatusChip";
const colors: Record<Status, string> = {
  running: "bg-running",
  attention: "bg-attention",
  blocked: "bg-blocked",
  success: "bg-success",
  stopped: "bg-stopped",
};
export function SegmentedProgress({
  value,
  total,
  label,
  tone = "running",
}: {
  value: number;
  total: number;
  label: string;
  tone?: Status;
}) {
  const reduced = useReducedMotionSafe();
  const max = Math.max(0, total);
  const current = Math.min(max, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={current}
      className="flex h-2 gap-0.5 overflow-hidden rounded-full"
    >
      {max > 40 ? (
        <span className="h-full flex-1 bg-foreground/10">
          <m.span
            className={cn("block h-full origin-left", colors[tone])}
            initial={false}
            animate={{ scaleX: current / max }}
            transition={reduced ? { duration: 0 } : spring.number}
          />
        </span>
      ) : (
        Array.from({ length: max }, (_, i) => (
          <m.span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed, stateless visual segments.
            key={i}
            style={{ backgroundColor: "color-mix(in oklab, var(--foreground) 10%, transparent)" }}
            className={cn(
              "h-full min-w-0.5 flex-1",
              i < current ? colors[tone] : "bg-foreground/10",
            )}
          >
            <m.span
              className={cn("block h-full origin-left", colors[tone])}
              initial={false}
              animate={{ scaleX: i < current ? 1 : 0 }}
              transition={reduced ? { duration: 0 } : spring.number}
            />
          </m.span>
        ))
      )}
    </div>
  );
}
