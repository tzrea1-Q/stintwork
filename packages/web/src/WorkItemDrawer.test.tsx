// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { WorkItemDrawer } from "./WorkItemDrawer";

afterEach(() => vi.unstubAllGlobals());

function DrawerExample({ worktree = false }: { worktree?: boolean }) {
  const [open, setOpen] = useState(false);
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  if (worktree) item.worktreePath = "/project-worktrees/first";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Inspect First
      </button>
      {open && <WorkItemDrawer item={item} onClose={() => setOpen(false)} />}
    </>
  );
}

test("the drawer is portalled, contains keyboard focus and returns it after dismissal", async () => {
  const user = userEvent.setup();
  const { container } = render(<DrawerExample />);
  const trigger = screen.getByRole("button", { name: "Inspect First" });
  await user.tab();
  await user.keyboard("{Enter}");
  const drawer = screen.getByRole("dialog", { name: "First" });
  expect(container).not.toContainElement(drawer);
  expect(within(drawer).getByRole("button", { name: "Close work item" })).toHaveFocus();
  const first = within(drawer).getByRole("combobox", { name: "Language" });
  first.focus();
  await user.tab({ shift: true });
  expect(drawer).toContainElement(document.activeElement as HTMLElement);
  await user.tab();
  expect(first).toHaveFocus();
  await user.tab();
  expect(within(drawer).getByRole("button", { name: "Close work item" })).toHaveFocus();
  expect(screen.getByRole("tooltip")).toHaveTextContent("Close work item");
  await user.keyboard("{Escape}");
  expect(drawer).toBeInTheDocument();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.keyboard("{Enter}");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.keyboard("{Enter}");
  await new Promise((resolve) => setTimeout(resolve, 0));
  fireEvent.pointerDown(document.body);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

test("dismissing a nested review leaves the drawer open and restores the review opener", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const user = userEvent.setup();
  render(<DrawerExample worktree />);
  await user.click(screen.getByRole("button", { name: "Inspect First" }));
  const reviewTrigger = screen.getByRole("button", { name: "Open review" });
  reviewTrigger.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "Close review" })).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(reviewTrigger).toHaveFocus());
  expect(screen.getByRole("dialog", { name: "First" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Close review" })).not.toBeInTheDocument();
});

test("the drawer shows and copies the worktree path even when no stint is active", async () => {
  const user = userEvent.setup();
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  item.worktreePath = "/project-worktrees/first";
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(screen.getByText("Work item files live in this worktree:")).toBeInTheDocument();
  expect(screen.getByText(item.worktreePath)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: `Copy ${item.worktreePath}` }));
  expect(await navigator.clipboard.readText()).toBe(item.worktreePath);
  expect(screen.getByRole("dialog")).toHaveTextContent("Copied");
});

test("the drawer does not claim a worktree for a main-checkout work item", () => {
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(screen.queryByText("Work item files live in this worktree:")).not.toBeInTheDocument();
  expect(screen.getByText(".scratch/first/spec.md")).toBeInTheDocument();
});
