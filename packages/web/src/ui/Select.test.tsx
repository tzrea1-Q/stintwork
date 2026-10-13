// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";

function MilestoneSelect() {
  const [value, setValue] = useState("m1");
  return (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger aria-label="Milestone">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        <SelectItem value="m1">First milestone</SelectItem>
        <SelectItem value="m2">Next milestone</SelectItem>
      </SelectContent>
    </Select>
  );
}

test("a select focuses its current option, navigates, selects and returns focus", async () => {
  const user = userEvent.setup();
  const { container } = render(<MilestoneSelect />);
  const trigger = screen.getByRole("combobox", { name: "Milestone" });
  expect(trigger).toHaveTextContent("First milestone");
  await user.click(trigger);
  const current = await screen.findByRole("option", { name: "First milestone" });
  await waitFor(() => expect(current).toHaveFocus());
  expect(current).toHaveAttribute("aria-selected", "true");
  expect(current.querySelector("svg")).toBeInTheDocument();
  expect(container).not.toContainElement(screen.getByRole("listbox"));
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(trigger).toHaveTextContent("Next milestone");
  expect(trigger).toHaveFocus();
  await user.keyboard("{Enter}{Home}{Enter}");
  await waitFor(() => expect(trigger).toHaveTextContent("All"));
  expect(trigger).toHaveFocus();
});

test("Escape and outside press dismiss without changing the selected value", async () => {
  const user = userEvent.setup();
  render(<MilestoneSelect />);
  const trigger = screen.getByRole("combobox", { name: "Milestone" });
  trigger.focus();
  await user.keyboard("{Enter}{ArrowDown}{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(trigger).toHaveTextContent("First milestone");
  expect(trigger).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("listbox")).toBeVisible();
  fireEvent.pointerDown(document.body);
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(trigger).toHaveTextContent("First milestone");
  expect(trigger).toHaveFocus();
});
