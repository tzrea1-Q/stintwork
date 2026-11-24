// SPDX-License-Identifier: Apache-2.0

import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, MotionGlobalConfig, m } from "motion/react";
import { Dialog as Primitive } from "radix-ui";
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ElementRef,
  forwardRef,
  type RefObject,
  useContext,
  useRef,
  useState,
} from "react";
import { cn } from "./cn";
import { blur, scale, spring, tween, useReducedMotionSafe } from "./motion";

const OpenContext = createContext(false);
export function Dialog({
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
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;

const contentVariants = cva(
  "fixed z-50 max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)] overflow-auto break-words rounded-[22px] border border-border bg-card p-6 text-sm text-foreground shadow-overlay",
  {
    variants: {
      placement: {
        center: "left-1/2 top-1/2 w-lg -translate-x-1/2 -translate-y-1/2",
        left: "bottom-4 left-4 top-4 w-96",
        right: "bottom-4 right-4 top-4 w-96",
      },
    },
    defaultVariants: { placement: "center" },
  },
);

export const DialogContent = forwardRef<
  ElementRef<typeof Primitive.Content>,
  ComponentPropsWithoutRef<typeof Primitive.Content> &
    VariantProps<typeof contentVariants> & {
      returnFocusRef?: RefObject<HTMLElement>;
      motion?: "dialog" | "palette";
      onExitComplete?: () => void;
    }
>(function DialogContent(
  {
    className,
    children,
    placement,
    onOpenAutoFocus,
    onCloseAutoFocus,
    onEscapeKeyDown,
    returnFocusRef,
    motion = "dialog",
    onExitComplete,
    ...props
  },
  ref,
) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const open = useContext(OpenContext);
  const reduced = useReducedMotionSafe();
  const side = placement === "left" || placement === "right";
  // Sheets enter with CSS starting styles so a delayed Motion renderer cannot leave them hidden.
  const hidden = reduced
    ? { opacity: 0 }
    : side
      ? { opacity: 0, x: placement === "left" ? "-100%" : "100%" }
      : {
          opacity: 0,
          scale: scale[motion],
          ...(motion === "dialog" ? { filter: `blur(${blur.surface}px)` } : {}),
        };
  const visible = reduced
    ? { opacity: 1 }
    : side
      ? { opacity: 1, x: 0 }
      : { opacity: 1, scale: 1, ...(motion === "dialog" ? { filter: "blur(0px)" } : {}) };
  return (
    <>
      <AnimatePresence onExitComplete={onExitComplete}>
        {open && (
          <Primitive.Portal forceMount>
            <Primitive.Overlay forceMount asChild>
              <m.div
                className="fixed inset-0 z-50 bg-backdrop data-[state=closed]:pointer-events-none"
                initial={MotionGlobalConfig.skipAnimations ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={tween.overlay}
              />
            </Primitive.Overlay>
          </Primitive.Portal>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <Primitive.Portal forceMount>
            <Primitive.Content
              {...props}
              forceMount
              asChild
              ref={ref}
              onEscapeKeyDown={(event) => {
                onEscapeKeyDown?.(event);
                event.stopPropagation();
              }}
              onOpenAutoFocus={(event) => {
                if (
                  !(
                    event.currentTarget instanceof HTMLElement &&
                    event.currentTarget.contains(document.activeElement)
                  )
                )
                  previousFocus.current =
                    document.activeElement instanceof HTMLElement ? document.activeElement : null;
                onOpenAutoFocus?.(event);
              }}
              onCloseAutoFocus={(event) => {
                onCloseAutoFocus?.(event);
                if (!event.defaultPrevented) {
                  const active = document.activeElement;
                  const target = returnFocusRef?.current ?? previousFocus.current;
                  if (
                    (returnFocusRef?.current ||
                      active === document.body ||
                      (event.target instanceof HTMLElement && event.target.contains(active))) &&
                    target?.isConnected &&
                    target !== document.body &&
                    !target.matches(":disabled")
                  ) {
                    event.preventDefault();
                    target.focus({ preventScroll: true });
                  }
                }
              }}
            >
              <m.div
                className={cn(
                  contentVariants({ placement }),
                  "data-[state=closed]:pointer-events-none",
                  side &&
                    "translate-x-0 data-[state=open]:transition-[translate] data-[state=open]:duration-(--motion-duration-sheet) data-[state=open]:ease-(--motion-ease-soft)",
                  placement === "left" && "motion-safe:starting:-translate-x-full",
                  placement === "right" && "motion-safe:starting:translate-x-full",
                  className,
                )}
                initial={MotionGlobalConfig.skipAnimations || (side && !reduced) ? false : hidden}
                animate={visible}
                exit={{
                  ...hidden,
                  transition: motion === "palette" && !side ? tween.menu : tween.dismiss,
                }}
                transition={side ? tween.sheet : motion === "palette" ? tween.menu : spring.surface}
              >
                {children}
              </m.div>
            </Primitive.Content>
          </Primitive.Portal>
        )}
      </AnimatePresence>
    </>
  );
});
