// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "./Tooltip";

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
