// SPDX-License-Identifier: Apache-2.0
import * as Primitive from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "./cn";

export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverClose = Primitive.Close;
export const PopoverAnchor = Primitive.Anchor;
export const PopoverContent = forwardRef<
  ElementRef<typeof Primitive.Content>,
  ComponentPropsWithoutRef<typeof Primitive.Content>
>(function PopoverContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        {...props}
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={17}
        avoidCollisions
        className={cn(
          "z-50 max-w-[calc(100vw-34px)] max-h-[var(--radix-popover-content-available-height)] overflow-auto break-words rounded-md border border-border bg-surface p-4 text-sm text-text shadow-overlay",
          className,
        )}
      />
    </Primitive.Portal>
  );
});
