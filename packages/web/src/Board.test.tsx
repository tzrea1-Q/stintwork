// SPDX-License-Identifier: Apache-2.0
import {
  builtInWorkflows,
  createMemoryRepoFiles,
  foldStintLog,
  indexProject,
  planSetup,
} from "@stintwork/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import { WorkItemCard } from "./WorkItemCard";
import { LanguageProvider, languageStorageKey } from "./i18n/language";

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

beforeEach(() => {
  window.history.replaceState(null, "", "/?view=pipeline");
});

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
    "aria-valuenow",
    "1",
  );
  expect(screen.getByRole("progressbar", { name: "board resolved tickets" })).toHaveAttribute(
    "aria-valuemax",
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

test("milestone filter counts resolved local tickets without a merge", async () => {
  const snapshot = project({
    ...files,
    ".scratch/board/issues/02-ui.md": "# 02 — Pipeline\nStatus: resolved",
  });
  const item = snapshot.workItems.find((entry) => entry.slug === "board");
  expect(item?.merged).toBeUndefined();
  expect(item?.github).toBeUndefined();
  expect(item?.tickets).toHaveLength(2);
  expect(item?.tickets.every((ticket) => ticket.resolved)).toBe(true);
  render(<Board snapshot={snapshot} />);
  await userEvent.setup().click(screen.getByRole("combobox", { name: "Milestone" }));
  expect(await screen.findByRole("option", { name: "M1 · The board" })).toHaveAccessibleDescription(
    "1/1 shipped",
  );
});

test("milestone filter hides other milestones", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  expect(
    screen.getByRole("combobox", { name: "Milestone" }).closest(".board-toolbar"),
  ).not.toBeNull();
  expect(
    within(document.querySelector(".top-bar") as HTMLElement).queryByRole("combobox"),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("combobox", { name: "Milestone" }));
  const option = await screen.findByRole("option", { name: "M1 · The board" });
  expect(option).toHaveAccessibleDescription("0/1 shipped");
  expect(within(option).getByTitle("M1 · The board")).toHaveTextContent("M1 · The board");
  await user.click(option);
  expect(screen.getByRole("article", { name: /^board:/ })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: /^next:/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("article", { name: /^clarify:/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("combobox", { name: "Milestone" }));
  await user.click(await screen.findByRole("option", { name: "M2 · Next" }));
  expect(screen.getByRole("article", { name: /^next:/ })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: /^board:/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("combobox", { name: "Milestone" }));
  await user.click(await screen.findByRole("option", { name: "All milestones" }));
  expect(screen.getByRole("article", { name: /^board:/ })).toBeInTheDocument();
});

test("the toolbar milestone picker supports keyboard selection and dismissal without changing the URL", async () => {
  window.history.replaceState(null, "", "/?keep=original&view=pipeline");
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  const picker = screen.getByRole("combobox", { name: "Milestone" });
  const url = window.location.href;
  picker.focus();
  await user.keyboard("{Enter}");
  const all = await screen.findByRole("option", { name: "All milestones" });
  await waitFor(() => expect(all).toHaveFocus());
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => expect(picker).toHaveFocus());
  expect(picker).toHaveTextContent("M1 · The board");
  expect(picker.querySelector("[data-truncate]")).toHaveAttribute("title", "M1 · The board");
  expect(screen.queryByRole("article", { name: /^next:/ })).not.toBeInTheDocument();
  expect(window.location.href).toBe(url);
  await user.keyboard("{Enter}");
  const selected = await screen.findByRole("option", { name: "M1 · The board" });
  await waitFor(() => expect(selected).toHaveFocus());
  await user.keyboard("{ArrowDown}{Escape}");
  await waitFor(() => expect(picker).toHaveFocus());
  expect(picker).toHaveTextContent("M1 · The board");
  expect(window.location.href).toBe(url);
});

test("shows blocked and inferred badges", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  const board = within(screen.getByRole("article", { name: /^board:/ }));
  expect(board.getByText("Blocked")).toBeInTheDocument();
  await user.hover(board.getByRole("button", { name: "Inferred" }));
  expect(await screen.findByRole("tooltip")).toHaveTextContent(/no valid workflow.yaml/);
  expect(board.getByRole("button", { name: "Inferred" })).toHaveAccessibleDescription(
    /Some tickets are open/,
  );
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

test.each([
  [
    "en",
    "GitHub work items are issues created through agent skills, such as to-spec.",
    "View repository issues",
    "Create work item",
    "Open command palette",
  ],
  [
    "zh-CN",
    "GitHub 工作项是 Issue，请通过智能体技能（如 to-spec）创建。",
    "查看仓库 Issue",
    "创建工作项",
    "打开命令面板",
  ],
])(
  "GitHub tracker explains creation and hides local creation in %s",
  async (language, guidance, link, create, palette) => {
    localStorage.setItem(languageStorageKey, language);
    const snapshot = project({ "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n" });
    snapshot.github = {
      repository: "example/project",
      repositoryId: "repo-id",
      items: [],
      scanned: 0,
      cursor: null,
      complete: true,
      pages: [],
      warnings: [],
    };
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <Board snapshot={snapshot} />
      </LanguageProvider>,
    );
    expect(screen.getByText(guidance)).toBeVisible();
    expect(screen.getByRole("link", { name: link })).toHaveAttribute(
      "href",
      "https://github.com/example/project/issues",
    );
    expect(screen.getByRole("link", { name: link })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: link })).toHaveAttribute("rel", "noreferrer");
    expect(screen.queryByRole("button", { name: create })).not.toBeInTheDocument();
    expect(screen.queryByText(".scratch/<work-item>/spec.md")).not.toBeInTheDocument();
    await user.keyboard("c");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: palette }));
    expect(screen.queryByText(create)).not.toBeInTheDocument();
    localStorage.removeItem(languageStorageKey);
  },
);

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
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ ...planSetup(createMemoryRepoFiles(files)), skills: [] })),
    ),
  );
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  const needsYou = screen.getByRole("button", { name: /^Needs you/ });
  await user.click(needsYou);
  expect(await screen.findByRole("region", { name: "Project warnings" })).toHaveTextContent(/99/);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "Project warnings" })).not.toBeInTheDocument();
  expect(needsYou).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(await screen.findByRole("menuitem", { name: /Project setup/ }));
  const setup = await screen.findByRole("dialog", { name: "Project setup" });
  expect(await within(setup).findByText("Glossary")).toBeVisible();
  expect(setup).toHaveTextContent("Optional");
  const overlay = document.querySelector(".bg-backdrop");
  if (!(overlay instanceof HTMLElement)) throw new Error("Missing dialog overlay");
  await user.click(overlay);
  expect(screen.queryByRole("dialog", { name: "Project setup" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
});

test("updates ticket progress from a new snapshot and resets a removed milestone filter", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Board snapshot={project()} />);
  await user.click(screen.getByRole("combobox", { name: "Milestone" }));
  await user.click(await screen.findByRole("option", { name: "M1 · The board" }));
  const updated = project({
    ...files,
    ".scratch/board/issues/02-ui.md": "# Pipeline\nStatus: resolved",
  });
  updated.milestones = [];
  rerender(<Board snapshot={updated} />);
  expect(screen.getByRole("combobox", { name: "Milestone" })).toHaveTextContent("All");
  expect(
    within(screen.getByRole("region", { name: "Review" })).getByRole("article", {
      name: /^board:/,
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "board resolved tickets" })).toHaveAttribute(
    "aria-valuenow",
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

test("?item=<slug> opens the drawer on load", async () => {
  window.history.replaceState(null, "", "/?item=board");
  render(<Board snapshot={project()} />);
  const drawer = screen.getByRole("dialog", { name: "The live board" });
  expect(within(drawer).getByRole("button", { name: "Close work item" })).toHaveFocus();
  await userEvent.setup().click(within(drawer).getByText("Agents by stage"));
  const rail = within(drawer).getByRole("list", { name: "Feature workflow stages" });
  expect(rail.querySelector('[aria-current="step"]')).toHaveTextContent("ImplementInferred");
  expect(within(drawer).getByText(/Feature · M1 · The board/)).toBeVisible();
});

test("command palette jumps to a work item", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  window.history.replaceState(null, "", "/");
  await user.click(screen.getByRole("combobox", { name: "Milestone" }));
  await user.click(await screen.findByRole("option", { name: "M1 · The board" }));
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
  expect(screen.getByRole("combobox", { name: "Milestone" })).toHaveTextContent("M2 · Next");
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
  expect(screen.getByRole("combobox", { name: "Milestone" })).toHaveTextContent("All");
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
  expect(screen.getByRole("button", { name: "Close work item" })).toHaveFocus();
  await user.click(within(drawer).getByText("Agents by stage"));
  expect(
    within(drawer)
      .getByRole("list", { name: "Feature workflow stages" })
      .querySelector('[aria-current="step"]'),
  ).toHaveTextContent("ReviewInferred");
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
  await user.click(within(drawer).getByText("Agents by stage"));
  expect(
    Array.from(
      within(drawer).getByRole("list", { name: "Bug workflow stages" }).querySelectorAll("li dt"),
    ).map((stage) => stage.firstChild?.textContent),
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

function githubProject() {
  const snapshot = project();
  snapshot.setup.tracker = "github-issues";
  snapshot.github = {
    repository: "example/project",
    repositoryId: "R_1",
    items: [],
    scanned: 42,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
    fetchedAt: "2026-10-28T12:00:00Z",
  };
  return snapshot;
}

test.each([
  ["en", "Verifying GitHub account…", "No work items yet"],
  ["zh-CN", "正在验证 GitHub 账号…", "还没有工作项"],
])("redacted GitHub snapshot shows verification in %s", (language, verifying, empty) => {
  localStorage.setItem(languageStorageKey, language);
  const snapshot = githubProject();
  snapshot.workItems = [];
  if (!snapshot.github) throw new Error("Missing GitHub snapshot");
  snapshot.github = { ...snapshot.github, verifying: true, complete: true };
  render(
    <LanguageProvider>
      <Board snapshot={snapshot} />
    </LanguageProvider>,
  );
  expect(screen.getByText(verifying)).toBeVisible();
  expect(screen.queryByText(empty)).not.toBeInTheDocument();
  expect(screen.queryByText(/42 issues scanned/)).not.toBeInTheDocument();
});

test("keeps the GitHub drawer open while its item is redacted", async () => {
  const snapshot = githubProject();
  if (!snapshot.github) throw new Error("Missing GitHub snapshot");
  snapshot.workItems = [{ ...snapshot.workItems[0], slug: "github-1" }];
  const { rerender } = render(<Board snapshot={snapshot} />);
  await userEvent.click(screen.getByRole("button", { name: /^Open github-1:/ }));
  expect(new URL(window.location.href).searchParams.get("item")).toBe("github-1");
  const redacted = {
    ...snapshot,
    workItems: [],
    github: { ...snapshot.github, verifying: true },
  };
  rerender(<Board snapshot={redacted} />);
  expect(screen.getByRole("dialog", { name: "Verifying GitHub account…" })).toBeVisible();
  expect(new URL(window.location.href).searchParams.get("item")).toBe("github-1");
  rerender(<Board snapshot={snapshot} />);
  expect(screen.getByRole("dialog")).toHaveTextContent(snapshot.workItems[0].title);
  rerender(<Board snapshot={{ ...redacted, github: { ...redacted.github, verifying: false } }} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(new URL(window.location.href).searchParams.has("item")).toBe(false);
});

test.each([
  [
    "en",
    "GitHub could not be reached. Showing stale data when available.",
    "Retry",
    "Verifying GitHub account…",
  ],
  ["zh-CN", "无法连接 GitHub。如有旧数据，将显示旧数据。", "重试", "正在验证 GitHub 账号…"],
])("redacted GitHub errors offer recovery in %s", (language, error, retry, verifying) => {
  localStorage.setItem(languageStorageKey, language);
  const snapshot = githubProject();
  if (!snapshot.github) throw new Error("Missing GitHub snapshot");
  snapshot.workItems = [];
  snapshot.github = {
    ...snapshot.github,
    verifying: true,
    discoveryFailed: true,
    error: "offline",
    errorCode: "offline",
  };
  render(
    <LanguageProvider>
      <Board snapshot={snapshot} />
    </LanguageProvider>,
  );
  expect(screen.getByText(error)).toBeVisible();
  expect(screen.getByRole("button", { name: retry })).toBeEnabled();
  expect(screen.getByText(verifying)).toBeVisible();
});

test("GitHub fresh and partial status expose keyboard actions", async () => {
  const user = userEvent.setup();
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  const snapshot = githubProject();
  const { rerender } = render(<Board snapshot={snapshot} />);
  const region = screen.getByRole("status", { name: "GitHub discovery status" });
  expect(within(region).getByText(/Fetched .*42 issues scanned/)).toBeInTheDocument();
  const refresh = within(region).getByRole("button", { name: "Refresh" });
  refresh.focus();
  await user.tab({ shift: true });
  await user.tab();
  expect(refresh).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith("/api/github/discovery/refresh", { method: "POST" }),
  );
  snapshot.github = { ...snapshot.github!, complete: false, cursor: "next" };
  rerender(<Board snapshot={snapshot} />);
  expect(
    within(region).getByText("Results are incomplete; dependencies and approvals may be unknown."),
  ).toBeInTheDocument();
  refresh.focus();
  await user.tab();
  expect(within(region).getByRole("button", { name: "Load more" })).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith("/api/github/discovery/load-more", { method: "POST" }),
  );
});

test("stale data is visible and stint start is disabled with a reason", async () => {
  const snapshot = githubProject();
  snapshot.github = {
    ...snapshot.github!,
    stale: true,
    discoveryFailed: true,
    error: "server error",
    errorCode: "offline",
  };
  render(<Board snapshot={snapshot} />);
  expect(screen.getByText(/Last successful fetch:/)).toBeInTheDocument();
  expect(
    screen.getByText("GitHub could not be reached. Showing stale data when available."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: /^Open board:/ }));
  const start = screen.getAllByRole("button", { name: "Start stint" })[0];
  expect(start).toBeDisabled();
  expect(start).toHaveAccessibleDescription(
    "GitHub data is stale. Refresh before starting a stint or approving a gate.",
  );
});

test("unavailable and rate limited discovery never looks empty", () => {
  const snapshot = githubProject();
  snapshot.workItems = [];
  snapshot.github = {
    ...snapshot.github!,
    fetchedAt: undefined,
    repositoryId: "",
    error: "limit",
    errorCode: "rate-limited",
    discoveryFailed: true,
    retryAt: "2099-01-01T00:00:00Z",
  };
  render(<Board snapshot={snapshot} />);
  expect(screen.getByText("GitHub issues unavailable")).toBeInTheDocument();
  expect(screen.queryByText("No work items yet")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  expect(screen.getByText(/^Retry after/)).toBeInTheDocument();
});

test.each([
  ["gh-missing", "未安装 GitHub CLI。请安装 `gh` 后重试。"],
  ["login", "GitHub 登录不可用。请通过 `gh` 登录后重试。"],
  ["unavailable", "仓库或 Issue 不可用。请检查仓库和访问权限后重试。"],
  ["rate-limited", "已达到 GitHub 速率限制。请在提示的时间后重试。"],
  ["offline", "无法连接 GitHub。如有旧数据，将显示旧数据。"],
  ["server-error", "无法连接 GitHub。如有旧数据，将显示旧数据。"],
  ["incomplete", "结果不完整；依赖关系和审批状态可能未知。"],
  ["cap", "结果不完整；连接已达到安全上限。"],
  ["identity", "无法验证 GitHub 身份。请刷新后继续。"],
])("GitHub %s error is translated", (code, message) => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  const snapshot = githubProject();
  snapshot.github = {
    ...snapshot.github!,
    fetchedAt: undefined,
    repositoryId: "",
    error: "English server error",
    errorCode: code,
  };
  render(
    <LanguageProvider>
      <Board snapshot={snapshot} />
    </LanguageProvider>,
  );
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(screen.queryByText("English server error")).not.toBeInTheDocument();
  localStorage.removeItem(languageStorageKey);
});

test("local tracker has no GitHub discovery status", () => {
  render(<Board snapshot={project()} />);
  expect(screen.queryByRole("status", { name: "GitHub discovery status" })).not.toBeInTheDocument();
});

test("retry becomes available after the rate limit expires", async () => {
  const snapshot = githubProject();
  snapshot.github = {
    ...snapshot.github!,
    repositoryId: "",
    fetchedAt: undefined,
    error: "limit",
    errorCode: "rate-limited",
    discoveryFailed: true,
    retryAt: new Date(Date.now() + 200).toISOString(),
  };
  render(<Board snapshot={snapshot} />);
  const retry = screen.getByRole("button", { name: "Retry" });
  expect(retry).toBeDisabled();
  await waitFor(() => expect(retry).toBeEnabled());
});

test.each([false, true])(
  "drawer freshness is scoped to each item; discovery failure=%s",
  async (discoveryFailed) => {
    const snapshot = githubProject();
    snapshot.github = {
      ...snapshot.github!,
      stale: true,
      discoveryFailed,
      items: [
        {
          id: "A",
          number: 1,
          title: "A",
          url: "https://example.com/1",
          complete: true,
          detail: { spec: "", tickets: [], stale: true },
        },
        {
          id: "B",
          number: 2,
          title: "B",
          url: "https://example.com/2",
          complete: true,
          detail: { spec: "", tickets: [] },
        },
      ],
    };
    for (const [slug, id, number] of [
      ["board", "A", 1],
      ["next", "B", 2],
    ] as const) {
      const item = snapshot.workItems.find((entry) => entry.slug === slug)!;
      item.github = {
        repository: "example/project",
        repositoryId: "R_1",
        issueId: id,
        number,
        url: `https://example.com/${number}`,
        complete: true,
        bound: true,
      };
    }
    const user = userEvent.setup();
    const { rerender } = render(<Board snapshot={snapshot} />);
    await user.click(screen.getByRole("button", { name: /^Open board:/ }));
    expect(screen.getAllByRole("button", { name: "Start stint" })[0]).toBeDisabled();
    snapshot.github.items[0].detail = undefined;
    snapshot.github.items[0].detailFailed = true;
    rerender(<Board snapshot={snapshot} />);
    expect(screen.getAllByRole("button", { name: "Start stint" })[0]).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /^Open next:/ }));
    const start = screen.getAllByRole("button", { name: "Start stint" })[0];
    if (discoveryFailed) expect(start).toBeDisabled();
    else expect(start).toBeEnabled();
  },
);

test("incomplete but freshly read GitHub detail does not make the drawer read-only", async () => {
  const snapshot = githubProject();
  const item = snapshot.workItems.find((entry) => entry.slug === "board");
  if (!item || !snapshot.github) throw new Error("Missing GitHub fixture");
  item.github = {
    repository: "example/project",
    repositoryId: "R",
    issueId: "I",
    number: 1,
    url: "https://example.com/1",
    complete: false,
    bound: true,
  };
  snapshot.github = {
    ...snapshot.github,
    items: [
      {
        id: "I",
        number: 1,
        title: "Parent",
        url: "https://example.com/1",
        complete: false,
        detailFailed: false,
        detail: {
          spec: "",
          tickets: [],
          complete: false,
          stale: false,
          warnings: ["Issue #2: text blockers unknown."],
        },
      },
    ],
  };
  render(<Board snapshot={snapshot} />);
  await userEvent.setup().click(screen.getByRole("button", { name: /^Open board:/ }));
  expect(
    screen.queryByText(
      "GitHub data is stale. Refresh before starting a stint or approving a gate.",
    ),
  ).not.toBeInTheDocument();
});

test.each([
  ["en", "Tickets not loaded", "Tickets may be outdated"],
  ["zh-CN", "工单未加载", "工单可能已过时"],
])(
  "GitHub cards distinguish unloaded, stale and loaded tickets in %s",
  (language, unloaded, outdated) => {
    localStorage.setItem(languageStorageKey, language);
    const github = {
      repository: "example/project",
      repositoryId: "R",
      scanned: 1,
      cursor: null,
      complete: true,
      pages: [],
      warnings: [],
      items: [
        {
          id: "I",
          number: 1,
          title: "Parent",
          url: "https://github.com/example/project/issues/1",
          complete: true,
        },
      ],
    };
    const files = createMemoryRepoFiles({
      "docs/agents/issue-tracker.md": "# Issue tracker: GitHub",
    });
    const snapshot = () => indexProject(files, { name: "Remote", github });
    const { rerender } = render(
      <LanguageProvider>
        <Board snapshot={snapshot()} />
      </LanguageProvider>,
    );
    const card = () => screen.getByRole("article", { name: /^github-1:/ });
    expect(within(card()).getByText(unloaded)).toBeInTheDocument();
    expect(within(card()).queryByText(/0\/0/)).not.toBeInTheDocument();
    expect(within(card()).queryByRole("progressbar")).not.toBeInTheDocument();
    const detail = { spec: "", tickets: [], stale: true };
    github.items[0] = { ...github.items[0], detail } as (typeof github.items)[0];
    rerender(
      <LanguageProvider>
        <Board snapshot={snapshot()} />
      </LanguageProvider>,
    );
    expect(within(card()).getByText(outdated)).toBeInTheDocument();
    expect(within(card()).queryByRole("progressbar")).not.toBeInTheDocument();
    detail.stale = false;
    github.items[0] = { ...github.items[0], detailFailed: true } as (typeof github.items)[0];
    rerender(
      <LanguageProvider>
        <Board snapshot={snapshot()} />
      </LanguageProvider>,
    );
    expect(within(card()).getByText(outdated)).toBeInTheDocument();
    expect(within(card()).queryByRole("progressbar")).not.toBeInTheDocument();
    github.items[0] = { ...github.items[0], detailFailed: false } as (typeof github.items)[0];
    rerender(
      <LanguageProvider>
        <Board snapshot={snapshot()} />
      </LanguageProvider>,
    );
    expect(within(card()).getByText(/0\/0/)).toBeInTheDocument();
    expect(within(card()).getByRole("progressbar")).toBeInTheDocument();
    localStorage.removeItem(languageStorageKey);
  },
);

test("workflow filter narrows the board without changing the URL", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={project()} />);
  const url = window.location.href;
  await user.click(screen.getByRole("combobox", { name: "Workflow" }));
  await user.click(await screen.findByRole("option", { name: "Bug" }));
  expect(screen.getByRole("article", { name: /^bug-login:/ })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: /^board:/ })).not.toBeInTheDocument();
  expect(window.location.href).toBe(url);
});

test("card tint, status and segmented progress follow snapshot state", () => {
  const item = project().workItems.find((entry) => entry.slug === "board");
  if (!item) throw new Error("Missing board fixture");
  const stint = foldStintLog([
    {
      type: "started",
      at: "2026-10-09T10:00:00Z",
      stint: {
        id: "stint",
        workItem: item.slug,
        stage: "implement",
        ticket: 1,
        agent: "codex",
        worktree: { path: "/worktree", branch: "work" },
        baseCommit: "base",
        brief: { skill: null, pointers: [], lastHandoff: null, changedPaths: [], prompt: "Work" },
      },
    },
  ]);
  const { rerender } = render(
    <WorkItemCard item={{ ...item, activeStint: stint }} onOpen={() => {}} />,
  );
  const card = screen.getByRole("article");
  expect(card).toHaveClass("bg-running-soft");
  expect(within(card).getByRole("status")).toHaveTextContent("Stint running");
  expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  rerender(<WorkItemCard item={item} attentionCount={1} selected onOpen={() => {}} />);
  expect(card).toHaveClass("bg-attention-soft", "ring-ring");
  expect(within(card).getByRole("status")).toHaveTextContent("Needs you");
  rerender(
    <WorkItemCard
      item={{
        ...item,
        tickets: item.tickets.map((ticket) => ({ ...ticket, blocked: !ticket.resolved })),
      }}
      onOpen={() => {}}
    />,
  );
  expect(card).toHaveClass("bg-blocked-soft");
  expect(within(card).getByText("Blocked")).toBeInTheDocument();
});

test("empty stages remain named, counted and focusable", () => {
  render(<Board snapshot={project({ ".scratch/one/spec.md": "# One" })} />);
  const column = screen.getByRole("region", { name: "Ship" });
  expect(column).toHaveClass("flex-[0_0_64px]", "min-w-16");
  expect(column).toHaveAttribute("tabindex", "0");
  expect(within(column).getByText("0")).toBeInTheDocument();
});

test.each([true, false])("board shortcuts while detail is open (docked=%s)", async (docked) => {
  vi.stubGlobal("matchMedia", () => ({
    matches: docked,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const user = userEvent.setup();
  render(
    <Board
      snapshot={project({
        ".scratch/alpha/notes.md": "Question",
        ".scratch/beta/notes.md": "Question",
      })}
    />,
  );
  const alpha = screen.getByRole("button", { name: "Open alpha: Alpha" });
  const beta = screen.getByRole("button", { name: "Open beta: Beta" });
  await user.click(alpha);
  if (docked) {
    await user.keyboard("c");
    expect(screen.queryByRole("dialog", { name: /create work item/i })).not.toBeInTheDocument();
    alpha.focus();
    await user.keyboard("{ArrowDown}");
    expect(beta).toHaveFocus();
    await user.keyboard("c");
    expect(screen.getByRole("dialog", { name: /create work item/i })).toBeInTheDocument();
  } else {
    fireEvent.keyDown(alpha, { key: "ArrowDown" });
    fireEvent.keyDown(alpha, { key: "c" });
    expect(beta).not.toHaveFocus();
    expect(screen.queryByRole("dialog", { name: /create work item/i })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Alpha" })).toBeInTheDocument();
  }
  vi.unstubAllGlobals();
});

test("overview hides the pipeline wrapper and its docked detail", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const user = userEvent.setup();
  const { container } = render(<Board snapshot={project()} />);
  await user.click(screen.getByRole("button", { name: "Open board: The live board" }));
  expect(screen.getByRole("complementary", { name: "The live board" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /^Overview$/ }));
  expect(screen.queryByRole("complementary", { name: "The live board" })).not.toBeInTheDocument();
  expect(container.querySelector(".pipeline-main")?.parentElement).not.toBeVisible();
  vi.unstubAllGlobals();
});
