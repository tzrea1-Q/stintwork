// SPDX-License-Identifier: Apache-2.0
"use client";

import { m } from "motion/react";
import { spring, useReducedMotionSafe, usePress } from "./motion";
import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { cn } from "./cn";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";

import { toggleVariants } from "./Toggle";

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    id?: string;
    spacing?: number;
    value?: string | string[];
    orientation?: "horizontal" | "vertical";
  }
>({
  size: "default",
  variant: "default",
  spacing: 2,
  orientation: "horizontal",
});

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
    orientation?: "horizontal" | "vertical";
  }) {
  const id = React.useId();
  const [internal, setInternal] = React.useState<string | string[]>(
    props.defaultValue ?? (props.type === "multiple" ? [] : ""),
  );
  const value = props.value ?? internal;
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      orientation={orientation}
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-lg data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-vertical:flex-col data-vertical:items-stretch",
        className,
      )}
      {...props}
      onValueChange={(next: string & string[]) => {
        setInternal(next);
        (props.onValueChange as ((value: typeof next) => void) | undefined)?.(next);
      }}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing, orientation, id, value }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);
  const { press, rest } = usePress("control", props);
  const reduced = useReducedMotionSafe();
  const selected = Array.isArray(context.value)
    ? context.value.includes(props.value)
    : context.value === props.value;

  return (
    <ToggleGroupPrimitive.Item
      asChild
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        "relative isolate shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        "aria-pressed:bg-transparent data-[state=on]:bg-transparent",
        className,
      )}
      {...rest}
    >
      <m.button {...press}>
        {selected && (
          <m.span
            aria-hidden="true"
            data-slot="toggle-indicator"
            layoutId={
              reduced
                ? undefined
                : `${context.id}-${Array.isArray(context.value) ? props.value : "single"}`
            }
            transition={spring.selection}
            className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-muted"
          />
        )}
        <span className="relative">{children}</span>
      </m.button>
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
