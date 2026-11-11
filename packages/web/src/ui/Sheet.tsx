// SPDX-License-Identifier: Apache-2.0
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react";
import { cn } from "./cn";
import { DialogContent } from "./Dialog";

export {
  Dialog as Sheet,
  DialogClose as SheetClose,
  DialogDescription as SheetDescription,
  DialogTitle as SheetTitle,
  DialogTrigger as SheetTrigger,
} from "./Dialog";

export const SheetContent = forwardRef<
  ElementRef<typeof DialogContent>,
  Omit<ComponentPropsWithoutRef<typeof DialogContent>, "placement"> & { side?: "left" | "right" }
>(function SheetContent({ side = "right", className, ...props }, ref) {
  return (
    <DialogContent
      {...props}
      ref={ref}
      placement={side}
      className={cn(side === "right" ? "rounded-r-none" : "rounded-l-none", className)}
    />
  );
});
