// SPDX-License-Identifier: Apache-2.0
import { AnimatePresence, m, MotionGlobalConfig } from "motion/react";
import { Popover as Primitive } from "radix-ui";
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
export function Popover({
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
export const PopoverTrigger = Primitive.Trigger;
export const PopoverClose = Primitive.Close;
export const PopoverAnchor = Primitive.Anchor;
export const PopoverContent = forwardRef<
  ElementRef<typeof Primitive.Content>,
  ComponentPropsWithoutRef<typeof Primitive.Content>
>(function PopoverContent({ className, children, sideOffset = 4, ...props }, ref) {
  const open = useContext(OpenContext);
  const reduced = useReducedMotionSafe();
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: scale.popover };
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
              "z-50 max-w-[calc(100vw-34px)] max-h-[var(--radix-popover-content-available-height)] overflow-auto break-words rounded-xl border border-border bg-card p-4 text-sm text-foreground shadow-overlay",
              className,
            )}
          >
            <m.div
              style={{ transformOrigin: "var(--radix-popover-content-transform-origin)" }}
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
