// SPDX-License-Identifier: Apache-2.0
import { AnimatePresence, m, MotionGlobalConfig } from "motion/react";
import { Tooltip as Primitive } from "radix-ui";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  createContext,
  forwardRef,
  useContext,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { cn } from "./cn";
import { scale, spring, useReducedMotionSafe } from "./motion";

let lastClose = -Infinity;
const TooltipContext = createContext({ open: true, instant: false });

export const TooltipProvider = Primitive.Provider;
export function Tooltip({
  open,
  defaultOpen = false,
  onOpenChange,
  ...props
}: ComponentPropsWithoutRef<typeof Primitive.Root>) {
  const [currentOpen, setOpen] = useState(defaultOpen);
  const actualOpen = open ?? currentOpen;
  const wasOpen = useRef(false);
  const instant = useRef(false);
  if (actualOpen !== wasOpen.current) {
    if (actualOpen) instant.current = Date.now() - lastClose < 500;
    else lastClose = Date.now();
    wasOpen.current = actualOpen;
  }
  return (
    <TooltipContext.Provider value={{ open: actualOpen, instant: instant.current }}>
      <Primitive.Root
        {...props}
        open={actualOpen}
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
    </TooltipContext.Provider>
  );
}
export const TooltipTrigger = Primitive.Trigger;
export const TooltipContent = forwardRef<
  ElementRef<typeof Primitive.Content>,
  ComponentPropsWithoutRef<typeof Primitive.Content>
>(function TooltipContent({ className, children, sideOffset = 4, ...props }, ref) {
  const { open, instant } = useContext(TooltipContext);
  const reduced = useReducedMotionSafe();
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: scale.tooltip };
  return open ? (
    <AnimatePresence>
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
            "z-50 max-w-[calc(100vw-34px)] max-h-[var(--radix-tooltip-content-available-height)] overflow-auto break-words rounded-lg bg-primary px-2 py-1 text-xs text-primary-foreground shadow-overlay",
            className,
          )}
        >
          <m.div
            data-instant={instant ? "true" : "false"}
            style={{ transformOrigin: "var(--radix-tooltip-content-transform-origin)" }}
            initial={MotionGlobalConfig.skipAnimations ? false : hidden}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={{ ...hidden, transition: { duration: 0 } }}
            transition={instant ? { duration: 0 } : spring.pop}
          >
            {children}
          </m.div>
        </Primitive.Content>
      </Primitive.Portal>
    </AnimatePresence>
  ) : null;
});
