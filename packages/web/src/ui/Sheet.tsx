// SPDX-License-Identifier: Apache-2.0
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { DialogContent } from "./Dialog";

export {
  Dialog as Sheet,
  DialogTrigger as SheetTrigger,
  DialogClose as SheetClose,
  DialogTitle as SheetTitle,
  DialogDescription as SheetDescription,
} from "./Dialog";

export const SheetContent = forwardRef<
  ElementRef<typeof DialogContent>,
  Omit<ComponentPropsWithoutRef<typeof DialogContent>, "placement"> & { side?: "left" | "right" }
>(function SheetContent({ side = "right", ...props }, ref) {
  return <DialogContent {...props} ref={ref} placement={side} />;
});
