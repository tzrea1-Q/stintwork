// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "./Sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./Tooltip";

afterEach(() => vi.restoreAllMocks());

test("fractional tooltip widths keep the full viewport gutter after pixel rounding", async () => {
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(360);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(900);
  vi.spyOn(document.body, "clientWidth", "get").mockReturnValue(360);
  const isFloating = (element: Element) =>
    element.hasAttribute("data-radix-popper-content-wrapper");
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === document.documentElement || this === document.body) return 360;
    return isFloating(this) ? 129 : 24;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return isFloating(this) ? 28 : 24;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this === document.documentElement || this === document.body)
      return new DOMRect(0, 0, 360, 900);
    if (!isFloating(this)) return new DOMRect(320, 80, 24, 24);
    const transform = (this as HTMLElement).style.transform;
    const position = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    return new DOMRect(Number(position?.[1] ?? 0), Number(position?.[2] ?? 0), 129.25, 28);
  });
  const computedStyle = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const style = computedStyle(element);
    if (element === document.body) style.margin = "0px";
    if (isFloating(element)) {
      style.width = "129.25px";
      style.height = "28px";
    }
    return style;
  });
  render(
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger aria-label="Close work item">×</TooltipTrigger>
        <TooltipContent>Close work item</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  await screen.findByRole("tooltip", { name: "Close work item" });
  const floating = document.querySelector<HTMLElement>("[data-radix-popper-content-wrapper]");
  if (!floating) throw new Error("Missing tooltip positioning wrapper");
  await waitFor(() => expect(floating.style.transform).toMatch(/translate\([\d.]+px/));
  expect(floating.getBoundingClientRect().right).toBeLessThanOrEqual(360 - 16);
  expect(floating.getBoundingClientRect().left).toBeGreaterThanOrEqual(16);
});

test("a tooltip describes its keyboard trigger and dismisses without moving focus", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger aria-label="Help">?</TooltipTrigger>
        <TooltipContent>Help</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  await user.tab();
  const tooltip = await screen.findByRole("tooltip", { name: "Help" });
  const trigger = screen.getByRole("button", { name: "Help" });
  expect(trigger).toHaveAccessibleDescription("Help");
  expect(container).not.toContainElement(tooltip);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

test("Escape dismisses a focused close-button tooltip before its sheet", async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider delayDuration={0}>
      <Sheet>
        <SheetTrigger>Open details</SheetTrigger>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Details</SheetTitle>
          <input aria-label="Name" />
          <Tooltip>
            <TooltipTrigger asChild>
              <SheetClose aria-label="Close details">×</SheetClose>
            </TooltipTrigger>
            <TooltipContent>Close details</TooltipContent>
          </Tooltip>
        </SheetContent>
      </Sheet>
    </TooltipProvider>,
  );
  const opener = screen.getByRole("button", { name: "Open details" });
  await user.click(opener);
  const sheet = await screen.findByRole("dialog", { name: "Details" });
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus());
  await user.tab();
  const close = screen.getByRole("button", { name: "Close details" });
  expect(close).toHaveFocus();
  await screen.findByRole("tooltip", { name: "Close details" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  expect(sheet).toBeVisible();
  expect(close).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(opener).toHaveFocus();
});

test.each(["default", "controlled"])(
  "a %s open tooltip reports its dismissal once",
  async (mode) => {
    const user = userEvent.setup();
    const changed = vi.fn();
    function Example() {
      const [open, setOpen] = useState(true);
      return (
        <TooltipProvider>
          <Tooltip
            defaultOpen={mode === "default"}
            open={mode === "controlled" ? open : undefined}
            onOpenChange={(nextOpen) => {
              changed(nextOpen);
              setOpen(nextOpen);
            }}
          >
            <TooltipTrigger aria-label="Help">?</TooltipTrigger>
            <TooltipContent>Help</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    render(<Example />);
    await screen.findByRole("tooltip", { name: "Help" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
  },
);
