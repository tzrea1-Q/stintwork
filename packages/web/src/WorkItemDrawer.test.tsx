// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { WorkItemDrawer } from "./WorkItemDrawer";

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
