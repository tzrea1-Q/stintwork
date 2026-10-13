// SPDX-License-Identifier: Apache-2.0
import * as Primitive from "@radix-ui/react-tooltip";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "./cn";

export const TooltipProvider = Primitive.Provider;
export const Tooltip = Primitive.Root;
export const TooltipTrigger = Primitive.Trigger;
export const TooltipContent = forwardRef<
  ElementRef<typeof Primitive.Content>,
  ComponentPropsWithoutRef<typeof Primitive.Content>
>(function TooltipContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        {...props}
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={16}
        className={cn(
          "z-50 max-w-[calc(100vw-32px)] max-h-[var(--radix-tooltip-content-available-height)] overflow-auto break-words rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text shadow-overlay",
          className,
        )}
      />
    </Primitive.Portal>
  );
});
