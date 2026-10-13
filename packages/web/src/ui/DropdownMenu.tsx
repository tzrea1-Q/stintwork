// SPDX-License-Identifier: Apache-2.0
import * as Primitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "./cn";

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;
export const DropdownMenuLabel = Primitive.Label;
export const DropdownMenuSeparator = Primitive.Separator;

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof Primitive.Content>,
  ComponentPropsWithoutRef<typeof Primitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        {...props}
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={17}
        avoidCollisions
        className={cn(
          "z-50 min-w-32 max-w-[calc(100vw-34px)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-auto rounded-md border border-border bg-surface p-1 text-sm text-text shadow-overlay",
          className,
        )}
      />
    </Primitive.Portal>
  );
});

const itemClass =
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1 break-words outline-none data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof Primitive.Item>,
  ComponentPropsWithoutRef<typeof Primitive.Item>
>(function DropdownMenuItem({ className, ...props }, ref) {
  return <Primitive.Item {...props} ref={ref} className={cn(itemClass, className)} />;
});

export const DropdownMenuRadioItem = forwardRef<
  ElementRef<typeof Primitive.RadioItem>,
  ComponentPropsWithoutRef<typeof Primitive.RadioItem>
>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <Primitive.RadioItem {...props} ref={ref} className={cn(itemClass, "pl-7", className)}>
      <span className="absolute left-2 flex size-icon-sm items-center justify-center">
        <Primitive.ItemIndicator>
          <Check className="size-icon-sm" aria-hidden="true" />
        </Primitive.ItemIndicator>
      </span>
      {children}
    </Primitive.RadioItem>
  );
});
