// SPDX-License-Identifier: Apache-2.0
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react";
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
>(function SheetContent({ side = "right", ...props }, ref) {
  return <DialogContent {...props} ref={ref} placement={side} />;
});
