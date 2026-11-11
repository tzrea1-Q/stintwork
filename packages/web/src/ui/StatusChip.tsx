// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { cn } from "./cn";
export type Status = "running" | "attention" | "blocked" | "success" | "stopped";
export const statusColors: Record<Status, string> = {
  running: "bg-running-soft text-running-foreground",
  attention: "bg-attention-soft text-attention-foreground",
  blocked: "bg-blocked-soft text-blocked-foreground",
  success: "bg-success-soft text-success-foreground",
  stopped: "bg-stopped-soft text-stopped-foreground",
};
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
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs",
        statusColors[status],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full bg-current",
          pulse && status === "running" && "motion-safe:animate-pulse",
        )}
      />
      {children}
    </span>
  );
}
