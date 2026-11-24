// SPDX-License-Identifier: Apache-2.0
"use client";

import * as React from "react";
import { m, MotionGlobalConfig } from "motion/react";
import { blur, shift, spring, tween, useReducedMotionSafe } from "./motion";

const TabsContext = React.createContext("");
const TabsListId = React.createContext("");
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";
import { Tabs as TabsPrimitive } from "radix-ui";

function Tabs({
  className,
  orientation = "horizontal",
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className)}
      value={value ?? internal}
      onValueChange={(next) => {
        setInternal(next);
        onValueChange?.(next);
      }}
      {...props}
    >
      <TabsContext.Provider value={value ?? internal}>{children}</TabsContext.Provider>
    </TabsPrimitive.Root>
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  const id = React.useId();
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      <TabsListId.Provider value={id}>{children}</TabsListId.Provider>
    </TabsPrimitive.List>
  );
}

function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const value = React.useContext(TabsContext);
  const id = React.useContext(TabsListId);
  const reduced = useReducedMotionSafe();
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-[color,border-color] duration-(--motion-duration-color) ease-(--motion-ease-color) group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:text-foreground dark:data-[state=active]:text-foreground",

        className,
      )}
      {...props}
    >
      {value === props.value && (
        <m.span
          aria-hidden="true"
          data-slot="tabs-indicator"
          layoutId={reduced ? undefined : id}
          transition={spring.selection}
          className="pointer-events-none absolute -inset-px rounded-md bg-background shadow-sm dark:border dark:border-input dark:bg-input/30 group-data-[variant=line]/tabs-list:inset-auto group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:border-0 group-data-[variant=line]/tabs-list:bg-foreground group-data-[variant=line]/tabs-list:shadow-none group-data-[orientation=horizontal]/tabs:group-data-[variant=line]/tabs-list:inset-x-0 group-data-[orientation=horizontal]/tabs:group-data-[variant=line]/tabs-list:bottom-[-5px] group-data-[orientation=horizontal]/tabs:group-data-[variant=line]/tabs-list:h-0.5 group-data-[orientation=vertical]/tabs:group-data-[variant=line]/tabs-list:inset-y-0 group-data-[orientation=vertical]/tabs:group-data-[variant=line]/tabs-list:-right-1 group-data-[orientation=vertical]/tabs:group-data-[variant=line]/tabs-list:w-0.5"
        />
      )}
      <span className="relative">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  const reduced = useReducedMotionSafe();
  return (
    <TabsPrimitive.Content
      asChild
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    >
      <m.div
        layout="position"
        initial={
          MotionGlobalConfig.skipAnimations
            ? false
            : reduced
              ? { opacity: 0 }
              : { opacity: 0, y: shift.panel, filter: `blur(${blur.swap}px)` }
        }
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={tween.swap}
      >
        {props.children}
      </m.div>
    </TabsPrimitive.Content>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
