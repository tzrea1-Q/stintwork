// SPDX-License-Identifier: Apache-2.0
import { Tooltip as Primitive } from "radix-ui";
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "./cn";

export const TooltipProvider = Primitive.Provider;
export function Tooltip({
  open,
  defaultOpen = false,
  onOpenChange,
  ...props
}: ComponentPropsWithoutRef<typeof Primitive.Root>) {
  const [currentOpen, setOpen] = useState(defaultOpen);
  return (
    <Primitive.Root
      {...props}
      open={open ?? currentOpen}
      onOpenChange={(nextOpen) => {
        const change = () => {
          setOpen(nextOpen);
          onOpenChange?.(nextOpen);
        };
        if (nextOpen) change();
        else {
          flushSync(change);
          // Workaround: Radix 1.2 restores the parent Escape listener after tooltip dismissal too late; remove when upstream restores it synchronously.
          flushSync(() => document.dispatchEvent(new CustomEvent("dismissableLayer.update")));
        }
      }}
    />
  );
}
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
        collisionPadding={17}
        avoidCollisions
        className={cn(
          "z-50 max-w-[calc(100vw-34px)] max-h-[var(--radix-tooltip-content-available-height)] overflow-auto break-words rounded-lg bg-primary px-2 py-1 text-xs text-primary-foreground shadow-overlay",
          className,
        )}
      />
    </Primitive.Portal>
  );
});
