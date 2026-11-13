// SPDX-License-Identifier: Apache-2.0

import { cva, type VariantProps } from "class-variance-authority";
import { Dialog as Primitive } from "radix-ui";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
  type RefObject,
  useRef,
} from "react";
import { cn } from "./cn";

export const Dialog = Primitive.Root;
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
    }
>(function DialogContent(
  {
    className,
    placement,
    onOpenAutoFocus,
    onCloseAutoFocus,
    onEscapeKeyDown,
    returnFocusRef,
    ...props
  },
  ref,
) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-backdrop" />
      <Primitive.Content
        {...props}
        ref={ref}
        className={cn(contentVariants({ placement }), className)}
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event);
          event.stopPropagation();
        }}
        onOpenAutoFocus={(event) => {
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
      />
    </Primitive.Portal>
  );
});
