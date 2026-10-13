// SPDX-License-Identifier: Apache-2.0
import { builtInWorkflows, createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
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
  ".scratch/shipped/workflow.yaml": `workflow: feature\nstage: ship\nmerged: { at: '2026-10-10T10:00:00Z', commit: '${"a".repeat(40)}' }`,
  ".scratch/shipped/issues/01-resolved.md": "# Resolved ticket\nStatus: resolved",
  ".scratch/previous/spec.md": "# Previous work item",
  ".scratch/previous/workflow.yaml": `workflow: feature\nstage: ship\nmerged: { at: '2026-10-10T10:00:00Z', commit: '${"b".repeat(40)}' }`,
  ".scratch/bug-login/spec.md": "# Diagnose login",
  ".scratch/fix-login/issues/01-fix.md": "# Fix login\nStatus: open",
  ".scratch/quick/spec.md": "# Quick change",
  ".scratch/quick/workflow.yaml": "workflow: quick\nstage: do",
  ".scratch/effort/map.md": "# A large effort",
};

function project(contents: Record<string, string> = files) {
  return indexProject(createMemoryRepoFiles(contents), { name: "Stintwork", branch: "codex/06" });
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

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

test("stage navigation describes its keyboard controls without moving focus", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  const navigation = screen.getByRole("navigation", { name: "Stage navigation" });
  for (const name of ["Previous stages", "Next stages"]) {
    const trigger = within(navigation).getByRole("button", { name });
    trigger.focus();
    await screen.findByRole("tooltip", { name });
    expect(trigger).toHaveAccessibleDescription(name);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  }
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
  await user.click(screen.getByRole("heading", { name: "Shipped" }));
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

test("opens the drawer from a card and closes it with Esc", async () => {
  const user = userEvent.setup();
  window.history.replaceState({ preserved: true }, "", "/?view=pipeline#anchor");
  render(<Board snapshot={project()} />);
  const card = screen.getByRole("button", { name: "Open board: The live board" });
  await user.click(card);
  const drawer = screen.getByRole("dialog", { name: "The live board" });
  expect(within(drawer).getByRole("button", { name: "Close work item" })).toHaveFocus();
  expect(window.location.search).toBe("?view=pipeline&item=board");
  expect(window.history.state).toEqual({ preserved: true });
  expect(window.location.hash).toBe("#anchor");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(window.location.search).toBe("?view=pipeline");
  expect(card).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog", { name: "The live board" })).toBeInTheDocument();
});

test("renders tickets in dependency order with Blocked by", async () => {
  const user = userEvent.setup();
  render(
    <Board
      snapshot={project({
        ".scratch/board/spec.md": "# The live board",
        ".scratch/board/issues/01-finish.md":
          "# Finish\nStatus: open\nBlocked by: 03, 02\n\n## Outcome\nFinish `implementation`.\n\n## Comments\nRead the spec first.",
        ".scratch/board/issues/02-model.md": "# Model\nStatus: resolved\nBlocked by: none",
        ".scratch/board/issues/03-ui.md": "# UI\nStatus: open\nBlocked by: 02",
      })}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Open board: The live board" }));
  const tickets = within(screen.getByRole("region", { name: "Tickets 3" }));
  const entries = tickets.getAllByRole("listitem");
  expect(entries.map((entry) => entry.querySelector("strong")?.textContent)).toEqual([
    "02 · Model",
    "03 · UI",
    "01 · Finish",
  ]);
  expect(entries[2]).toHaveTextContent("Blocked by 03, 02");
  expect(entries[1]).toHaveTextContent("Blocked by 02");
  expect(entries[0]).toHaveTextContent("resolved");
  const details = entries[2].querySelector("details");
  expect(details).not.toHaveAttribute("open");
  await user.click(within(entries[2]).getByText("01 · Finish"));
  expect(details).toHaveAttribute("open");
  expect(within(entries[2]).getByRole("heading", { name: "Outcome" })).toBeVisible();
  expect(within(entries[2]).getByText("Read the spec first.")).toBeVisible();
  expect(
    tickets.getByRole("button", { name: "Copy .scratch/board/issues/01-finish.md" }),
  ).toBeInTheDocument();
});

test("?item=<slug> opens the drawer on load", () => {
  window.history.replaceState(null, "", "/?item=board");
  render(<Board snapshot={project()} />);
  const drawer = screen.getByRole("dialog", { name: "The live board" });
  const rail = within(drawer).getByRole("list", { name: "Feature workflow stages" });
  expect(rail.querySelector('[aria-current="step"]')).toHaveTextContent("ImplementInferred");
  expect(drawer).toHaveTextContent("Milestone: M1 · The board");
  expect(within(drawer).getByRole("button", { name: "Close work item" })).toHaveFocus();
});

test("command palette jumps to a work item", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  await user.selectOptions(screen.getByRole("combobox", { name: "Milestone" }), "m1");
  await user.keyboard("{Meta>}k{/Meta}");
  const palette = within(screen.getByRole("dialog", { name: "Command palette" }));
  const search = palette.getByRole("combobox", { name: "Search work items and milestones" });
  expect(search).toHaveFocus();
  await user.type(search, "Next work item");
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Next work item" })).toBeInTheDocument();
  expect(window.location.search).toBe("?item=next");
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Open next: Next work item" })).toHaveFocus();
});

test("moves card focus within and across columns, skipping empty columns", async () => {
  const user = userEvent.setup();
  render(
    <Board
      snapshot={project({
        ".scratch/alpha/notes.md": "Question",
        ".scratch/beta/notes.md": "Question",
        ".scratch/gamma/issues/01-open.md": "# Open\nStatus: open\nBlocked by: none",
        ".scratch/delta/spec.md": "# Delta",
        ".scratch/delta/issues/01-resolved.md": "# Resolved\nStatus: resolved\nBlocked by: none",
      })}
    />,
  );
  const alpha = screen.getByRole("button", { name: "Open alpha: Alpha" });
  const beta = screen.getByRole("button", { name: "Open beta: Beta" });
  const gamma = screen.getByRole("button", { name: "Open gamma: Gamma" });
  alpha.focus();
  await user.keyboard("{ArrowDown}");
  expect(beta).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(beta).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  expect(gamma).toHaveFocus();
  await user.keyboard("{ArrowLeft}{ArrowUp}");
  expect(alpha).toHaveFocus();
  await user.keyboard("{ArrowLeft}");
  expect(alpha).toHaveFocus();
});

test("renders GFM safely and copies repo-relative paths", async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  render(
    <Board
      snapshot={project({
        ".scratch/board/spec.md":
          "# The live board\n\n## Scope\n\n- One\n- [x] Read\n- [ ] Implement\n\n```ts\nconst ready = true;\n```\n\nUse `pipeline`.\n\n| Stage | State |\n| --- | --- |\n| Spec | Ready |\n\n[Docs](https://example.com)\n\n<script>alert('bad')</script>\n\n[Unsafe](javascript:alert)\n",
      })}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Open board: The live board" }));
  const drawer = screen.getByRole("dialog");
  const content = within(drawer);
  expect(content.getByRole("heading", { name: "Scope" })).toBeInTheDocument();
  expect(
    content.getAllByRole("checkbox").map((checkbox) => (checkbox as HTMLInputElement).checked),
  ).toEqual([true, false]);
  for (const checkbox of content.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
  expect(
    within(content.getByRole("table")).getByRole("cell", { name: "Spec" }),
  ).toBeInTheDocument();
  expect(
    within(content.getByRole("table")).getByRole("cell", { name: "Ready" }),
  ).toBeInTheDocument();
  expect(content.getByText("const ready = true;")).toHaveClass("language-ts");
  expect(content.getByText("pipeline").tagName).toBe("CODE");
  expect(content.getByRole("link", { name: "Docs" })).toHaveAttribute(
    "href",
    "https://example.com",
  );
  expect(drawer.querySelector("script")).toBeNull();
  const unsafeLink = content.getByText("Unsafe");
  expect(unsafeLink.tagName).toBe("A");
  expect(unsafeLink).toHaveAttribute("href", "");
  await user.click(content.getByRole("button", { name: "Copy .scratch/board/spec.md" }));
  expect(writeText).toHaveBeenCalledWith(".scratch/board/spec.md");
  expect(content.getByText("Copied")).toBeInTheDocument();
  writeText.mockRejectedValue(new Error("Denied"));
  await user.click(content.getByRole("button", { name: "Copy .scratch/board/spec.md" }));
  expect(
    content.getByText("Could not copy. Select the path to copy it manually."),
  ).toBeInTheDocument();
  writeText.mockRestore();
});

test("command palette filters milestones and restores focus on Esc", async () => {
  const user = userEvent.setup();
  const snapshot = project();
  render(<Board snapshot={snapshot} />);
  const trigger = screen.getByRole("button", { name: "Open command palette" });
  await user.click(trigger);
  const palette = within(screen.getByRole("dialog", { name: "Command palette" }));
  expect(palette.getAllByRole("option")).toHaveLength(
    snapshot.workItems.length +
      snapshot.milestones.length +
      Object.keys(builtInWorkflows).length +
      2,
  );
  await user.click(palette.getByRole("option", { name: "M2 · Next" }));
  expect(screen.getByRole("combobox", { name: "Milestone" })).toHaveValue("m2");
  expect(trigger).toHaveFocus();
  await user.keyboard("{Control>}k{/Control}");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(
    within(screen.getByRole("dialog", { name: "Command palette" })).getByRole("option", {
      name: "All",
    }),
  );
  expect(screen.getByRole("combobox", { name: "Milestone" })).toHaveValue("");
});

test("keeps the drawer open when Esc dismisses a palette above it", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  await user.click(screen.getByRole("button", { name: "Open board: The live board" }));
  const close = screen.getByRole("button", { name: "Close work item" });
  await user.keyboard("{Control>}k{/Control}");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "The live board" })).toBeInTheDocument();
  expect(close).toHaveFocus();
});

test("refreshes the open drawer and returns focus to a card that changed stage", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Board snapshot={project()} />);
  await user.click(screen.getByRole("button", { name: "Open board: The live board" }));
  rerender(
    <Board
      snapshot={project({
        ...files,
        ".scratch/board/issues/02-ui.md": "# Pipeline\nStatus: resolved\nBlocked by: none",
      })}
    />,
  );
  const drawer = screen.getByRole("dialog");
  expect(
    within(drawer)
      .getByRole("list", { name: "Feature workflow stages" })
      .querySelector('[aria-current="step"]'),
  ).toHaveTextContent("ReviewInferred");
  expect(screen.getByRole("button", { name: "Close work item" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(
    within(screen.getByRole("region", { name: "Review" })).getByRole("button", {
      name: "Open board: The live board",
    }),
  ).toHaveFocus();
});

test("opens a shipped work item from the palette and reveals its card on return", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  await user.click(screen.getByRole("button", { name: "Open command palette" }));
  await user.type(
    screen.getByRole("combobox", { name: "Search work items and milestones" }),
    "shipped",
  );
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog", { name: "Merged work item" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Open shipped: Merged work item" })).toHaveFocus();
  expect(screen.getByRole("heading", { name: "Shipped" }).closest("details")).toHaveAttribute(
    "open",
  );
});

test("searches the palette by slug and supports its keyboard close button", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  const trigger = screen.getByRole("button", { name: "Open command palette" });
  await user.click(trigger);
  await user.type(
    screen.getByRole("combobox", { name: "Search work items and milestones" }),
    "bug-login",
  );
  await user.keyboard("{Enter}");
  const drawer = screen.getByRole("dialog", { name: "Diagnose login" });
  expect(
    Array.from(
      within(drawer)
        .getByRole("list", { name: "Bug workflow stages" })
        .querySelectorAll("li > span"),
    ).map((stage) => stage.textContent),
  ).toEqual(["Diagnose", "Fix", "Review", "Ship"]);
  await user.keyboard("{Escape}");
  await user.click(trigger);
  await user.tab();
  expect(screen.getByRole("button", { name: "Close command palette" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("shows an effort without inventing a stage or spec and handles Escape", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  const card = screen.getByRole("button", { name: "Open effort: Effort" });
  await user.click(card);
  const drawer = screen.getByRole("dialog", { name: "Effort" });
  expect(drawer).toHaveTextContent("No stage declared for this work item.");
  expect(drawer).toHaveTextContent("No spec yet.");
  expect(drawer).toHaveTextContent("No tickets yet.");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(card).toHaveFocus();
});
