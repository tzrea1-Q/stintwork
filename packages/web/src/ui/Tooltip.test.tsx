// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "./Tooltip";
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetClose } from "./Sheet";

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
