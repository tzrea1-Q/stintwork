// SPDX-License-Identifier: Apache-2.0

import { Check, ChevronDown } from "lucide-react";
import { Select as Primitive } from "radix-ui";
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "./Button";
import { cn } from "./cn";

export function Select({
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
        flushSync(() => {
          setOpen(nextOpen);
          onOpenChange?.(nextOpen);
        });
        // Workaround: refresh Radix 1.2's parent Escape listener synchronously until upstream fixes layer changes.
        flushSync(() => document.dispatchEvent(new CustomEvent("dismissableLayer.update")));
      }}
    />
  );
}
export const SelectValue = Primitive.Value;

export const SelectTrigger = forwardRef<
  ElementRef<typeof Primitive.Trigger>,
  ComponentPropsWithoutRef<typeof Primitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <Primitive.Trigger {...props} ref={ref} asChild>
      <Button
        className={cn(
          "min-w-0 justify-between [&>span]:min-w-0 [&>span:first-child]:truncate",
          className,
        )}
      >
        {children}
        <Primitive.Icon asChild>
          <ChevronDown className="shrink-0" aria-hidden="true" />
        </Primitive.Icon>
      </Button>
    </Primitive.Trigger>
  );
});

export const SelectContent = forwardRef<
  ElementRef<typeof Primitive.Content>,
  ComponentPropsWithoutRef<typeof Primitive.Content>
>(function SelectContent({ className, children, sideOffset = 4, ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        {...props}
        ref={ref}
        position="popper"
        sideOffset={sideOffset}
        collisionPadding={17}
        avoidCollisions
        className={cn(
          "z-50 w-[max(280px,var(--radix-select-trigger-width))] min-w-0 max-w-[calc(100vw-34px)] max-h-[var(--radix-select-content-available-height)] overflow-auto rounded-xl border border-border bg-card p-1 text-sm text-foreground shadow-overlay",
          className,
        )}
      >
        <Primitive.Viewport>{children}</Primitive.Viewport>
      </Primitive.Content>
    </Primitive.Portal>
  );
});

export const SelectItem = forwardRef<
  ElementRef<typeof Primitive.Item>,
  ComponentPropsWithoutRef<typeof Primitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  const label =
    props.title ?? props.textValue ?? (typeof children === "string" ? children : undefined);
  return (
    <Primitive.Item
      {...props}
      ref={ref}
      className={cn(
        "relative flex cursor-default items-center rounded-lg py-1 pl-7 pr-2 [overflow-wrap:anywhere] outline-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>[data-truncate]]:min-w-0 [&>[data-truncate]]:flex-1 [&>[data-truncate]]:truncate",
        className,
      )}
    >
      <Primitive.ItemIndicator className="absolute left-2 flex size-icon-sm items-center justify-center">
        <Check className="size-icon-sm" aria-hidden="true" />
      </Primitive.ItemIndicator>
      <Primitive.ItemText data-truncate={label ? "" : undefined} title={label}>
        {children}
      </Primitive.ItemText>
    </Primitive.Item>
  );
});
