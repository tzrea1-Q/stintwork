// SPDX-License-Identifier: Apache-2.0
import { m } from "motion/react";
import { usePress } from "./motion";
import {
  type ComponentPropsWithoutRef,
  type ComponentType,
  type RefAttributes,
  forwardRef,
} from "react";
import { cn } from "./cn";

const MotionInput = m.input as ComponentType<
  ComponentPropsWithoutRef<"input"> & RefAttributes<HTMLInputElement>
>;

export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithoutRef<"input">, "type">
>(function Checkbox({ className, ...props }, ref) {
  const { press, rest } = usePress("control", props);
  return (
    <MotionInput
      {...rest}
      {...press}
      ref={ref}
      type="checkbox"
      className={cn(
        "size-4 shrink-0 rounded-md accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed",
        className,
      )}
    />
  );
});
