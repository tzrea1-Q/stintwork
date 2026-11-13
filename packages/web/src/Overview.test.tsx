// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject, type ProjectSnapshot } from "@stintwork/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { zhCN } from "./i18n/zh-CN";
import { Overview } from "./Overview";

const project = (files: Record<string, string>) =>
  indexProject(createMemoryRepoFiles(files), { name: "Test" });
afterEach(() => window.history.replaceState(null, "", "/"));

test("Overview opens a work item in Pipeline with keyboard and restores view on history", async () => {
  window.history.replaceState(null, "", "/");
  const user = userEvent.setup();
  render(<Board snapshot={project({ ".scratch/one/spec.md": "# One" })} />);
  expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  const next = screen.getByRole("heading", { name: "One" }).closest('[data-slot="card"]');
  if (!(next instanceof HTMLElement)) throw new Error("Missing Next up card");
  const button = within(next).getByRole("button", { name: "Open" });
  button.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog", { name: "One" })).toBeVisible();
  expect(window.location.search).toContain("view=pipeline");
  expect(window.location.search).toContain("item=one");
});

test("empty Overview offers existing create and Pipeline actions and reports errors", async () => {
  window.history.replaceState(null, "", "/");
  const user = userEvent.setup();
  render(<Board snapshot={project({})} connection="reconnecting" error="Offline" />);
  expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
  expect(screen.getByRole("alert")).toHaveTextContent("Offline");
  expect(screen.queryByText("Next up")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "New work item" }));
  expect(screen.getByRole("dialog")).toBeVisible();
});

test("empty projects retain project-level attention and open its queue", async () => {
  const snapshot = project({});
  snapshot.attentionItems = [
    {
      kind: "login-required",
      id: "login",
      title: "Sign in",
      agent: "codex",
      workItem: null,
      ticket: null,
      stintId: null,
      details: "",
      raisedAt: "",
      loginCommand: "codex login",
    },
  ];
  const onNeedsYou = vi.fn();
  render(
    <Overview
      snapshot={snapshot}
      connection="live"
      onPipeline={() => {}}
      onOpenItem={() => {}}
      onNeedsYou={onNeedsYou}
      onCreate={() => {}}
      onMilestone={() => {}}
    />,
  );
  expect(screen.getByText("No work items yet")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Needs you 1" })).toBeVisible();
  const more = {
    ...snapshot,
    attentionItems: Array.from({ length: 4 }, (_, index) => ({
      ...snapshot.attentionItems[0],
      id: `login-${index}`,
    })),
  };
  const { unmount } = render(
    <Overview
      snapshot={more}
      connection="live"
      onPipeline={() => {}}
      onOpenItem={() => {}}
      onNeedsYou={() => {}}
      onCreate={() => {}}
      onMilestone={() => {}}
    />,
  );
  expect(screen.getByRole("heading", { name: "Needs you 4" })).toBeVisible();
  unmount();
  await userEvent.setup().click(screen.getByRole("button", { name: "Sign in" }));
  expect(onNeedsYou).toHaveBeenCalledOnce();
});

test("Overview localizes attention titles and workflow stage names", () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  const snapshot = project({ ".scratch/one/spec.md": "# One" });
  snapshot.attentionItems = [
    {
      kind: "gate-ready",
      id: "gate",
      title: "Spec ready",
      agent: null,
      workItem: "one",
      ticket: null,
      stintId: null,
      details: "",
      raisedAt: "",
      stage: "spec",
    } as ProjectSnapshot["attentionItems"][number],
  ];
  render(
    <LanguageProvider>
      <Overview
        snapshot={snapshot}
        connection="live"
        onPipeline={() => {}}
        onOpenItem={() => {}}
        onNeedsYou={() => {}}
        onCreate={() => {}}
        onMilestone={() => {}}
      />
    </LanguageProvider>,
  );
  expect(screen.getByRole("heading", { name: "需要你处理 1" })).toBeVisible();
  expect(screen.getByText("你的关注")).toBeVisible();
  const title = zhCN.needsYou.stageReady("规格说明");
  expect(screen.getByRole("button", { name: title })).toBeVisible();
  expect(screen.getByText(title)).toHaveAttribute("title", title);
  localStorage.removeItem(languageStorageKey);
});

test("refreshes elapsed time immediately when a running stint appears", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-01-01T00:00:00Z"));
  const snapshot = project({ ".scratch/one/spec.md": "# One" });
  const props = {
    connection: "live" as const,
    onPipeline: () => {},
    onOpenItem: () => {},
    onNeedsYou: () => {},
    onCreate: () => {},
    onMilestone: () => {},
  };
  const { rerender } = render(<Overview snapshot={snapshot} {...props} />);
  now.mockReturnValue(Date.parse("2026-01-01T01:00:00Z"));
  const item = snapshot.workItems[0];
  const running = {
    ...item,
    activeStint: {
      id: "stint",
      agent: "codex",
      stage: "spec",
      startedAt: "2026-01-01T00:55:00Z",
    } as NonNullable<typeof item.activeStint>,
  };
  rerender(<Overview snapshot={{ ...snapshot, workItems: [running] }} {...props} />);
  expect(screen.getByText(/5 min elapsed/)).toBeVisible();
  now.mockRestore();
});

test("orders cards and discloses shipped milestones", async () => {
  const snapshot = project({ ".scratch/one/spec.md": "# One" });
  snapshot.milestones = [
    { id: "done", name: "Done milestone", status: "shipped", workItemSlugs: [] },
    { id: "active", name: "Active milestone", status: "active", workItemSlugs: ["one"] },
  ];
  snapshot.workItems[0].milestone = "active";
  render(
    <Overview
      snapshot={snapshot}
      connection="live"
      onPipeline={() => {}}
      onOpenItem={() => {}}
      onNeedsYou={() => {}}
      onCreate={() => {}}
      onMilestone={() => {}}
    />,
  );
  const titles = Array.from(document.querySelectorAll('[data-slot="card-title"]')).map(
    (node) => node.textContent,
  );
  expect(titles).toEqual(["Roadmap", "Where the work is", "One"]);
  const summary = screen.getByText("1 shipped milestone");
  expect(screen.queryByRole("button", { name: "Done milestone" })).not.toBeVisible();
  await userEvent.setup().click(summary);
  expect(screen.getByRole("button", { name: "Done milestone" })).toBeVisible();
});

test.each([
  { ticketsKnown: false },
  { ticketsKnown: true, ticketsStale: true },
  { ticketsKnown: true, dependenciesUnknown: true },
])("shows unavailable ticket progress and an incomplete milestone hint for %o", (github) => {
  const snapshot = project({ ".scratch/one/spec.md": "# One" });
  const item = snapshot.workItems[0];
  item.slug = "a".repeat(150);
  item.milestone = "m";
  item.github = github as NonNullable<typeof item.github>;
  item.tickets = [
    {
      number: 1,
      slug: "ticket",
      title: "Ticket",
      status: "open",
      resolved: false,
      blockedBy: [],
      blocked: false,
      comments: [],
      body: "",
      path: "",
    },
  ];
  const name = "M".repeat(150);
  snapshot.milestones = [{ id: "m", name, status: "active", workItemSlugs: [item.slug] }];
  render(
    <Overview
      snapshot={snapshot}
      connection="live"
      onPipeline={() => {}}
      onOpenItem={() => {}}
      onNeedsYou={() => {}}
      onCreate={() => {}}
      onMilestone={() => {}}
    />,
  );
  const next = screen
    .getByRole("heading", { name: "One" })
    .closest('[data-slot="card"]') as HTMLElement;
  expect(within(next).getByText("Tickets resolved: Unavailable")).toBeVisible();
  expect(within(next).queryByRole("progressbar")).not.toBeInTheDocument();
  expect(within(next).getByText(new RegExp(item.slug)).className).toContain(
    "[overflow-wrap:anywhere]",
  );
  expect(within(next).getByText(new RegExp(name))).toBeVisible();
  expect(screen.getByText("Progress may be incomplete")).toBeVisible();
  expect(screen.getByText("0/1 work items")).toBeVisible();
});

test("shows shipped milestone progress and accessible seven day chart", () => {
  const snapshot = project({ ".scratch/one/spec.md": "# One", ".scratch/two/spec.md": "# Two" });
  snapshot.milestones = [
    { id: "done", name: "Latest shipped", status: "shipped", workItemSlugs: ["one", "two"] },
  ];
  for (const item of snapshot.workItems) item.milestone = "done";
  snapshot.workItems[0].merged = { at: "2026-01-01", commit: "abc" };
  snapshot.workItems[0].stints = [
    {
      id: "s",
      agent: "codex",
      stage: "spec",
      status: "finished",
      startedAt: new Date().toISOString(),
      endedAt: null,
    },
  ] as (typeof snapshot.workItems)[0]["stints"];
  render(
    <Overview
      snapshot={snapshot}
      connection="live"
      onPipeline={() => {}}
      onOpenItem={() => {}}
      onNeedsYou={() => {}}
      onCreate={() => {}}
      onMilestone={() => {}}
    />,
  );
  expect(screen.getAllByRole("button", { name: "Latest shipped" })[0]).toBeVisible();
  expect(screen.getByRole("progressbar", { name: "Latest shipped" })).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
  expect(screen.getByText((_, element) => element?.textContent === "50%")).toBeVisible();
  expect(
    within(screen.getByRole("list", { name: "Last 7 days" })).getAllByRole("listitem"),
  ).toHaveLength(7);
  expect(screen.getByLabelText(/: 1 stints/)).toBeInTheDocument();
});

test("advances the activity chart at local midnight without a running stint and cleans up", () => {
  vi.useFakeTimers();
  try {
    const before = new Date(2026, 2, 9, 23, 59, 59);
    vi.setSystemTime(before);
    const snapshot = project({ ".scratch/one/spec.md": "# One" });
    snapshot.workItems[0].stints = [
      {
        id: "s",
        agent: "codex",
        stage: "spec",
        status: "finished",
        startedAt: before.toISOString(),
        endedAt: null,
      },
    ] as (typeof snapshot.workItems)[0]["stints"];
    const { unmount } = render(
      <Overview
        snapshot={snapshot}
        connection="live"
        onPipeline={() => {}}
        onOpenItem={() => {}}
        onNeedsYou={() => {}}
        onCreate={() => {}}
        onMilestone={() => {}}
      />,
    );
    const chart = screen.getByRole("list", { name: "Last 7 days" });
    expect(within(chart).getAllByRole("listitem")[6]).toHaveAttribute(
      "aria-label",
      "Mar 9, 2026: 1 stints",
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(within(chart).getAllByRole("listitem")[5]).toHaveAttribute(
      "aria-label",
      "Mar 9, 2026: 1 stints",
    );
    expect(within(chart).getAllByRole("listitem")[6]).toHaveAttribute(
      "aria-label",
      "Mar 10, 2026: 0 stints",
    );
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test("keyboard focus follows the dashboard card order", async () => {
  const snapshot = project({ ".scratch/one/spec.md": "# One" });
  snapshot.milestones = [
    { id: "active", name: "Active milestone", status: "active", workItemSlugs: ["one"] },
  ];
  snapshot.workItems[0].milestone = "active";
  render(
    <Overview
      snapshot={snapshot}
      connection="live"
      onPipeline={() => {}}
      onOpenItem={() => {}}
      onNeedsYou={() => {}}
      onCreate={() => {}}
      onMilestone={() => {}}
    />,
  );
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByRole("button", { name: "Active milestone" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
});
