// SPDX-License-Identifier: Apache-2.0

import { cva, type VariantProps } from "class-variance-authority";
import { m } from "motion/react";
import { usePress } from "./motion";
import { Slot } from "radix-ui";
import {
  type ComponentPropsWithoutRef,
  type ComponentType,
  type RefAttributes,
  forwardRef,
  isValidElement,
  useImperativeHandle,
  useRef,
} from "react";
import { cn } from "./cn";

const buttonVariants = cva(
  "inline-flex max-w-full shrink-0 items-center justify-center gap-2 whitespace-normal border text-sm font-medium [overflow-wrap:anywhere] transition-[color,background-color,border-color,box-shadow,opacity] duration-(--motion-duration-color) ease-(--motion-ease-color) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-icon-sm",
  {
    variants: {
      variant: {
        primary: "border-transparent bg-primary text-primary-foreground hover:opacity-90",
        secondary: "border-border bg-card text-foreground hover:bg-secondary",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
        link: "border-transparent bg-transparent text-foreground hover:text-accent-foreground",
        danger: "border-transparent bg-destructive text-destructive-foreground hover:opacity-90",
      },
      size: {
        sm: "min-h-7 rounded-[14px] px-2 py-1",
        md: "min-h-8 rounded-[16px] px-3 py-1",
        lg: "min-h-10 rounded-[20px] px-4 py-2",
        icon: "size-8 rounded-full",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

const ButtonSlot = Slot.Root as ComponentType<
  ComponentPropsWithoutRef<"button"> & RefAttributes<HTMLButtonElement>
>;
const MotionButton = m.button as ComponentType<
  ComponentPropsWithoutRef<"button"> & {
    animate?: { scale: number };
    transition?: typeof import("./motion").spring.press;
  } & RefAttributes<HTMLButtonElement>
>;

export const Button = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }
>(function Button({ asChild, variant, size, className, type, ...props }, ref) {
  const { press, rest } = usePress("control", props);
  const elementRef = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => elementRef.current as HTMLButtonElement);
  const classes = cn(buttonVariants({ variant, size }), className);
  // Arbitrary asChild elements cannot be guaranteed to support Motion props.
  if (asChild) {
    const animated =
      isValidElement(rest.children) &&
      (rest.children.type === m.button || rest.children.type === m.a);
    return (
      <ButtonSlot
        {...(animated ? press : {})}
        ref={elementRef}
        type={type}
        className={classes}
        {...(animated ? rest : props)}
      />
    );
  }
  return (
    <MotionButton
      {...press}
      {...rest}
      ref={elementRef}
      type={type ?? "button"}
      className={classes}
    />
  );
});
