// SPDX-License-Identifier: Apache-2.0
import { Tabs as P } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";
export const Tabs = P.Root;
export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof P.List>) {
  return <P.List className={cn("inline-flex rounded-full bg-muted p-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof P.Trigger>) {
  return (
    <P.Trigger
      className={cn("rounded-full px-3 py-2 data-[state=active]:bg-card", className)}
      {...props}
    />
  );
}
export const TabsContent = P.Content;
