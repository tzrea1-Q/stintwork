// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { forwardRef, type ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./Dialog";
import { DropdownMenuContent } from "./DropdownMenu";
import { PopoverContent } from "./Popover";
import { SelectContent } from "./Select";
import { Sheet, SheetContent, SheetTitle } from "./Sheet";
import { TooltipContent } from "./Tooltip";

const contents = vi.hoisted(() => ({
  tooltip: vi.fn(),
  popover: vi.fn(),
  menu: vi.fn(),
  select: vi.fn(),
}));

vi.mock("radix-ui", async (original) => {
  const radix = await original<typeof import("radix-ui")>();
  const mockContent = (name: keyof typeof contents) => ({
    Portal: ({ children }: { children: ReactNode }) => children,
    Content: forwardRef((props, ref) => {
      contents[name](props, ref);
      return null;
    }),
  });
  return {
    ...radix,
    Tooltip: { ...radix.Tooltip, ...mockContent("tooltip") },
    Popover: { ...radix.Popover, ...mockContent("popover") },
    DropdownMenu: { ...radix.DropdownMenu, ...mockContent("menu") },
    Select: { ...radix.Select, ...mockContent("select") },
  };
});

test.each([
  ["Tooltip", TooltipContent, contents.tooltip],
  ["Popover", PopoverContent, contents.popover],
  ["DropdownMenu", DropdownMenuContent, contents.menu],
  ["Select", SelectContent, contents.select],
] as const)(
  "%s enforces collision avoidance and the rounding-safe gutter",
  (_, Content, content) => {
    render(<Content collisionPadding={0} avoidCollisions={false} />);
    expect(content).toHaveBeenCalledWith(
      expect.objectContaining({ collisionPadding: 17, avoidCollisions: true }),
      null,
    );
    expect(content.mock.calls[0]?.[0].className.split(" ")).toContain("max-w-[calc(100vw-34px)]");
  },
);

test.each(["center", "left", "right"] as const)(
  "Dialog %s constrains both dimensions to the viewport gutter",
  (placement) => {
    render(
      <Dialog defaultOpen>
        <DialogContent placement={placement} aria-describedby={undefined}>
          <DialogTitle>Details</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveClass(
      "max-w-[calc(100vw-32px)]",
      "max-h-[calc(100dvh-32px)]",
    );
    if (placement !== "center")
      expect(screen.getByRole("dialog")).toHaveClass("top-4", "bottom-4", `${placement}-4`);
  },
);

test.each(["left", "right"] as const)("Sheet %s retains the Dialog gutter", (side) => {
  render(
    <Sheet defaultOpen>
      <SheetContent side={side} aria-describedby={undefined}>
        <SheetTitle>Details</SheetTitle>
      </SheetContent>
    </Sheet>,
  );
  expect(screen.getByRole("dialog")).toHaveClass(
    "max-w-[calc(100vw-32px)]",
    "max-h-[calc(100dvh-32px)]",
    "top-4",
    "bottom-4",
    `${side}-4`,
  );
});
