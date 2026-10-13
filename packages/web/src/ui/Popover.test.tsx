// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { Popover, PopoverTrigger, PopoverContent, PopoverClose } from "./Popover";

test("a popover opens by keyboard, closes on Escape or outside press and returns focus", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <>
      <button type="button">Outside</button>
      <Popover>
        <PopoverTrigger>Details</PopoverTrigger>
        <PopoverContent aria-label="Details panel">
          <PopoverClose>Done</PopoverClose>
        </PopoverContent>
      </Popover>
    </>,
  );
  const trigger = screen.getByRole("button", { name: "Details" });
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("dialog", { name: "Details panel" })).toBeVisible();
  expect(container).not.toContainElement(screen.getByRole("dialog"));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Outside" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
