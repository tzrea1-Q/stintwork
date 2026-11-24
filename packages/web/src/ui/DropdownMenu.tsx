// SPDX-License-Identifier: Apache-2.0

import { AnimatePresence, m, MotionGlobalConfig } from "motion/react";
import { Check } from "lucide-react";
import { DropdownMenu as Primitive } from "radix-ui";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  createContext,
  forwardRef,
  useContext,
  useState,
} from "react";
import { cn } from "./cn";
import { scale, spring, tween, useReducedMotionSafe } from "./motion";

const OpenContext = createContext(true);
export function DropdownMenu({
  open,
  defaultOpen = false,
  onOpenChange,
  ...props
}: ComponentPropsWithoutRef<typeof Primitive.Root>) {
  const [internalOpen, setOpen] = useState(defaultOpen);
  const currentOpen = open ?? internalOpen;
  return (
    <OpenContext.Provider value={currentOpen}>
      <Primitive.Root
        {...props}
        open={currentOpen}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange?.(next);
        }}
      />
    </OpenContext.Provider>
  );
}
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;
export const DropdownMenuLabel = Primitive.Label;
export const DropdownMenuSeparator = Primitive.Separator;

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof Primitive.Content>,
  ComponentPropsWithoutRef<typeof Primitive.Content>
>(function DropdownMenuContent({ className, children, sideOffset = 4, ...props }, ref) {
  const open = useContext(OpenContext);
  const reduced = useReducedMotionSafe();
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: scale.menu };
  return (
    <AnimatePresence>
      {open && (
        <Primitive.Portal forceMount>
          <Primitive.Content
            {...props}
            ref={ref}
            forceMount
            asChild
            sideOffset={sideOffset}
            collisionPadding={17}
            avoidCollisions
            className={cn(
              "z-50 min-w-32 max-w-[calc(100vw-34px)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-auto rounded-xl border border-border bg-card p-1 text-sm text-foreground shadow-overlay",
              className,
            )}
          >
            <m.div
              style={{ transformOrigin: "var(--radix-dropdown-menu-content-transform-origin)" }}
              initial={MotionGlobalConfig.skipAnimations ? false : hidden}
              animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={{ ...hidden, transition: tween.dismiss }}
              transition={spring.pop}
            >
              {children}
            </m.div>
          </Primitive.Content>
        </Primitive.Portal>
      )}
    </AnimatePresence>
  );
});

const itemClass =
  "relative flex cursor-default items-center gap-2 rounded-lg px-2 py-1 break-words outline-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

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
