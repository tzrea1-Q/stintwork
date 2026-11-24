// SPDX-License-Identifier: Apache-2.0
import { AnimatePresence, m, MotionGlobalConfig, useIsPresent } from "motion/react";
import { blur, tween, useReducedMotionSafe } from "./motion";
import { usePulse } from "./usePulse";
import { forwardRef, type ReactNode } from "react";
import { cn } from "./cn";
export type Status = "running" | "attention" | "blocked" | "success" | "stopped";
export const statusColors: Record<Status, string> = {
  running: "bg-running-soft text-running-foreground",
  attention: "bg-attention-soft text-attention-foreground",
  blocked: "bg-blocked-soft text-blocked-foreground",
  success: "bg-success-soft text-success-foreground",
  stopped: "bg-stopped-soft text-stopped-foreground",
};
const StatusContent = forwardRef<
  HTMLSpanElement,
  { status: Status; pulse?: boolean; children: ReactNode }
>(function StatusContent({ status, pulse, children }, ref) {
  const reduced = useReducedMotionSafe();
  const pulseProps = usePulse<HTMLSpanElement>();
  const present = useIsPresent();
  return (
    <m.span
      ref={ref}
      className="inline-flex items-center gap-1"
      aria-hidden={present ? undefined : true}
      initial={
        MotionGlobalConfig.skipAnimations
          ? false
          : reduced
            ? { opacity: 0 }
            : { opacity: 0, filter: `blur(${blur.swap}px)` }
      }
      animate={{ opacity: 1, filter: "blur(0px)" }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, filter: `blur(${blur.swap}px)` }}
      transition={tween.swap}
    >
      <span
        aria-hidden="true"
        {...pulseProps}
        className={cn(
          "size-1.5 rounded-full bg-current",
          pulse && status === "running" && "motion-safe:animate-pulse",
        )}
      />
      {children}
    </m.span>
  );
});
export function StatusChip({
  status,
  pulse,
  children,
}: {
  status: Status;
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <m.span
      layout="size"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs",
        statusColors[status],
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <StatusContent key={status} status={status} pulse={pulse}>
          {children}
        </StatusContent>
      </AnimatePresence>
    </m.span>
  );
}
