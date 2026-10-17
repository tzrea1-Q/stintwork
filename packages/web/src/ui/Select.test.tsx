// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";
import { Dialog, DialogContent, DialogTitle } from "./Dialog";

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
  expect(trigger).toHaveClass("[&>span:first-child]:truncate");
  expect(trigger).toHaveTextContent("First milestone");
  await user.click(trigger);
  const current = await screen.findByRole("option", { name: "First milestone" });
  await waitFor(() => expect(current).toHaveFocus());
  expect(current).toHaveAttribute("aria-selected", "true");
  expect(current.querySelector("svg")).toBeInTheDocument();
  expect(container).not.toContainElement(screen.getByRole("listbox"));
  expect(screen.getByRole("listbox")).toHaveClass(
    "w-[max(280px,var(--radix-select-trigger-width))]",
    "min-w-0",
    "max-w-[calc(100vw-34px)]",
  );
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(trigger).toHaveTextContent("Next milestone");
  expect(trigger).toHaveFocus();
  await user.keyboard("{Enter}{Home}{Enter}");
  await waitFor(() => expect(trigger).toHaveTextContent("All"));
  expect(trigger).toHaveFocus();
});

test("long option names stay available when their single-line labels truncate", async () => {
  const user = userEvent.setup();
  const name = "A long milestone 里程碑 ".repeat(20).trim();
  function Picker() {
    const [value, setValue] = useState("all");
    return (
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger aria-label="Milestone">
          <SelectValue data-truncate title={value === "all" ? "All milestones" : name} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All milestones</SelectItem>
          <SelectItem value="long">{name}</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  render(<Picker />);
  const trigger = screen.getByRole("combobox", { name: "Milestone" });
  expect(trigger.querySelectorAll("[data-truncate]")).toHaveLength(1);
  await user.click(trigger);
  const option = await screen.findByRole("option", { name });
  const label = option.querySelector("[data-truncate]");
  expect(option).toHaveClass(
    "[&>[data-truncate]]:min-w-0",
    "[&>[data-truncate]]:flex-1",
    "[&>[data-truncate]]:truncate",
  );
  expect(label).toHaveAttribute("title", name);
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).toHaveTextContent(name);
  expect(trigger.querySelectorAll("[data-truncate]")).toHaveLength(1);
  expect(trigger.querySelector("[data-truncate]")).toHaveAttribute("title", name);
  expect(trigger.querySelector("[data-truncate]")?.childElementCount).toBe(0);
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

test("immediately cancelling a nested select dismisses only the select and returns focus", async () => {
  render(
    <Dialog defaultOpen>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Edit item</DialogTitle>
        <MilestoneSelect />
      </DialogContent>
    </Dialog>,
  );
  const dialog = screen.getByRole("dialog", { name: "Edit item" });
  const trigger = screen.getByRole("combobox", { name: "Milestone" });
  trigger.focus();
  act(() => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(dialog).toBeVisible();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  await userEvent.setup().keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
