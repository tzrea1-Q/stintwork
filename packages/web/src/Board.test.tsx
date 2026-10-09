import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { Board } from "./Board";

const files = {
  ".stintwork/roadmap.md":
    "## M1 · The board\nId: m1\nStatus: active\n- board\n\n## M2 · Next\nId: m2\nStatus: planned\n- next\n\n## Previous milestone\nId: old\nStatus: shipped\n- previous\n",
  ".scratch/board/spec.md": "# The live board",
  ".scratch/board/issues/01-model.md": "# 01 — Model\nStatus: resolved\nBlocked by: none",
  ".scratch/board/issues/02-ui.md": "# 02 — Pipeline\nStatus: open\nBlocked by: 99",
  ".scratch/next/spec.md": "# Next work item",
  ".scratch/clarify/notes.md": "A first question",
  ".scratch/planning/spec.md": "# Planning",
  ".scratch/planning/workflow.yaml": "workflow: feature\nstage: tickets",
  ".scratch/ready/spec.md": "# Ready for review",
  ".scratch/ready/issues/01-check.md": "# Check\nStatus: resolved",
  ".scratch/ship/spec.md": "# Ready to ship",
  ".scratch/ship/workflow.yaml": "workflow: feature\nstage: ship",
  ".scratch/ship/issues/01-open.md": "# Open ticket\nStatus: open",
  ".scratch/shipped/spec.md": "# Merged work item",
  ".scratch/shipped/workflow.yaml": "workflow: feature\nstage: ship",
  ".scratch/shipped/issues/01-resolved.md": "# Resolved ticket\nStatus: resolved",
  ".scratch/previous/spec.md": "# Previous work item",
  ".scratch/bug-login/spec.md": "# Diagnose login",
  ".scratch/fix-login/issues/01-fix.md": "# Fix login\nStatus: open",
  ".scratch/quick/spec.md": "# Quick change",
  ".scratch/quick/workflow.yaml": "workflow: quick\nstage: do",
  ".scratch/effort/map.md": "# A large effort",
};

function project(contents: Record<string, string> = files) {
  return indexProject(createMemoryRepoFiles(contents), { name: "Stintwork", branch: "codex/06" });
}

test("renders cards in the column of their stage", () => {
  render(<Board snapshot={project()} />);
  const placements = {
    Clarify: ["clarify", "bug-login"],
    Spec: ["next"],
    Tickets: ["planning"],
    Implement: ["board", "fix-login", "quick"],
    Review: ["ready"],
    Ship: ["ship"],
  };
  for (const [stage, slugs] of Object.entries(placements)) {
    const column = screen.getByRole("region", { name: stage });
    for (const slug of slugs)
      expect(
        within(column).getByRole("article", { name: new RegExp(`^${slug}:`) }),
      ).toBeInTheDocument();
  }
  expect(screen.getByRole("progressbar", { name: "board resolved tickets" })).toHaveAttribute(
    "value",
    "1",
  );
  expect(screen.getByRole("progressbar", { name: "board resolved tickets" })).toHaveAttribute(
    "max",
    "2",
  );
  expect(screen.getByText("codex/06")).toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "Work items without a stage" })).getByRole("article"),
  ).toHaveAccessibleName(/^effort:/);
});

test("milestone filter hides other milestones", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  await user.selectOptions(screen.getByRole("combobox", { name: "Milestone" }), "m1");
  expect(screen.getByRole("article", { name: /^board:/ })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: /^next:/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("article", { name: /^clarify:/ })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole("combobox"), "m2");
  expect(screen.getByRole("article", { name: /^next:/ })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: /^board:/ })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole("combobox"), "");
  expect(screen.getByRole("article", { name: /^board:/ })).toBeInTheDocument();
});

test("shows blocked and inferred badges", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  const board = within(screen.getByRole("article", { name: /^board:/ }));
  expect(board.getByText("Blocked")).toBeInTheDocument();
  expect(board.getByRole("button", { name: "Inferred" })).toHaveAccessibleDescription(
    /Some tickets are open/,
  );
  await user.hover(board.getByRole("button", { name: "Inferred" }));
  expect(board.getByRole("tooltip", { hidden: true })).toHaveTextContent(/no valid workflow.yaml/);
  expect(
    within(screen.getByRole("article", { name: /^ready:/ })).queryByText("Blocked"),
  ).not.toBeInTheDocument();
  expect(
    within(screen.getByRole("article", { name: /^planning:/ })).queryByText("Inferred"),
  ).not.toBeInTheDocument();
});

test("shows an empty state for a repo without .scratch", () => {
  render(<Board snapshot={project({ "AGENTS.md": "Project instructions" })} />);
  expect(screen.getByRole("heading", { name: "No work items yet" })).toBeInTheDocument();
  expect(screen.getByText(".scratch/<work-item>/spec.md")).toBeInTheDocument();
  expect(screen.getByText(".scratch/<work-item>/issues/")).toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

test("keeps shipped work collapsed and separate from active stages", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  const lane = screen.getByRole("heading", { name: "Shipped" }).closest("details");
  expect(lane).not.toHaveAttribute("open");
  await user.click(screen.getByText("Shipped"));
  expect(lane).toHaveAttribute("open");
  expect(screen.getByRole("article", { name: /^shipped:/ })).toBeInTheDocument();
  expect(screen.getByRole("article", { name: /^previous:/ })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Ship" })).getAllByRole("article")).toHaveLength(
    1,
  );
});

test("opens warnings and setup reports and dismisses them with Escape or outside clicks", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  await user.click(screen.getByRole("button", { name: /^Warnings/ }));
  expect(screen.getByRole("region", { name: "Project warnings" })).toHaveTextContent(/99/);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "Project warnings" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Warnings/ })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: /^Setup/ }));
  expect(screen.getByRole("region", { name: "Project setup" })).toHaveTextContent(
    "Glossary: Missing",
  );
  await user.click(screen.getByRole("heading", { name: /^Pipeline/ }));
  expect(screen.queryByRole("region", { name: "Project setup" })).not.toBeInTheDocument();
});

test("updates ticket progress from a new snapshot and resets a removed milestone filter", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Board snapshot={project()} />);
  await user.selectOptions(screen.getByRole("combobox"), "m1");
  const updated = project({
    ...files,
    ".scratch/board/issues/02-ui.md": "# Pipeline\nStatus: resolved",
  });
  updated.milestones = [];
  rerender(<Board snapshot={updated} />);
  expect(screen.getByRole("combobox")).toHaveValue("");
  expect(
    within(screen.getByRole("region", { name: "Review" })).getByRole("article", {
      name: /^board:/,
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "board resolved tickets" })).toHaveAttribute(
    "value",
    "2",
  );
});

test("does not mark a work item blocked when any open ticket is unblocked", () => {
  render(
    <Board
      snapshot={project({
        ...files,
        ".scratch/board/issues/03-open.md": "# Open\nStatus: ready-for-agent\nBlocked by: none",
      })}
    />,
  );
  expect(
    within(screen.getByRole("article", { name: /^board:/ })).queryByText("Blocked"),
  ).not.toBeInTheDocument();
});
