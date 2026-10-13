// SPDX-License-Identifier: Apache-2.0
import * as Primitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "./cn";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;

const contentVariants = cva(
  "fixed z-50 max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)] overflow-auto break-words rounded-md border border-border bg-surface p-6 text-sm text-text shadow-overlay",
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
  ComponentPropsWithoutRef<typeof Primitive.Content> & VariantProps<typeof contentVariants>
>(function DialogContent({ className, placement, ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-backdrop" />
      <Primitive.Content
        {...props}
        ref={ref}
        className={cn(contentVariants({ placement }), className)}
      />
    </Primitive.Portal>
  );
});
