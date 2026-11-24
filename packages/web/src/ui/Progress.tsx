// SPDX-License-Identifier: Apache-2.0
"use client";

import { m } from "motion/react";
import { spring, useReducedMotionSafe } from "./motion";
import type * as React from "react";
import { cn } from "./cn";
import { Progress as ProgressPrimitive } from "radix-ui";

function Progress({
  className,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const reduced = useReducedMotionSafe();
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator asChild data-slot="progress-indicator">
        <m.div
          className="size-full flex-1 origin-left bg-primary"
          initial={false}
          animate={{ scaleX: Math.max(0, Math.min(1, (value ?? 0) / max)) }}
          transition={reduced ? { duration: 0 } : spring.number}
        />
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
