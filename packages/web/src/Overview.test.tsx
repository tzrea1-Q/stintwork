// SPDX-License-Identifier: Apache-2.0
import { attentionSnapshot } from "./attention-test-fixtures";
import { kinds } from "./attention-kinds";
import { createMemoryRepoFiles, indexProject, type ProjectSnapshot } from "@stintwork/core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { domMax, LazyMotion } from "motion/react";
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
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: /breadcrumb/i })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Live");
  const next = screen.getByRole("heading", { name: "One" }).closest('[data-slot="card"]');
  if (!(next instanceof HTMLElement)) throw new Error("Missing Next up card");
  const button = within(next).getByRole("button", { name: "Open" });
  button.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog", { name: "One" })).toBeVisible();
  expect(window.location.search).toContain("view=pipeline");
  expect(window.location.search).toContain("item=one");
});

test("empty Overview offers creation and reports errors", async () => {
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
  expect(screen.getByRole("button", { name: `${title} · One` })).toBeVisible();
  expect(screen.getByText(`${title} · One`)).toHaveAttribute("title", `${title} · One`);
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
  expect(screen.getByText(/Elapsed 5 min/)).toBeVisible();
  now.mockRestore();
});

test("keeps older recent stints when the seven day chart is empty", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    const snapshot = project({ ".scratch/one/spec.md": "# One" });
    const at = "2026-02-01T12:00:00Z";
    snapshot.workItems[0].stints = [
      {
        id: "old",
        agent: "codex",
        stage: "spec",
        status: "finished",
        startedAt: at,
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
    expect(screen.getByText("No stints in the last 7 days")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Last 7 days" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent stints" })).toBeVisible();
    expect(screen.getByText("6 weeks ago")).toHaveAttribute(
      "title",
      new Date(at).toLocaleString("en"),
    );
  } finally {
    vi.useRealTimers();
  }
});

test("Where the work is excludes shipped milestone items", () => {
  const snapshot = project({ ".scratch/one/spec.md": "# One", ".scratch/two/spec.md": "# Two" });
  snapshot.milestones = [
    { id: "shipped", name: "Shipped", status: "shipped", workItemSlugs: ["one"] },
  ];
  snapshot.workItems[0].milestone = "shipped";
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
  const card = screen
    .getByRole("heading", { name: "Where the work is" })
    .closest('[data-slot="card"]') as HTMLElement;
  expect(card.querySelector('[data-slot="card-action"]')).toHaveTextContent("1 work items");
});

test("orders cards and discloses shipped milestones", async () => {
  const snapshot = project({ ".scratch/one/spec.md": "# One" });
  snapshot.milestones = [
    { id: "done", name: "Done milestone", status: "shipped", workItemSlugs: [] },
    { id: "active", name: "Active milestone", status: "active", workItemSlugs: ["one"] },
    { id: "planned", name: "Planned milestone", status: "planned", workItemSlugs: [] },
  ];
  snapshot.workItems[0].milestone = "active";
  render(
    <LazyMotion features={domMax}>
      <Overview
        snapshot={snapshot}
        connection="live"
        onPipeline={() => {}}
        onOpenItem={() => {}}
        onNeedsYou={() => {}}
        onCreate={() => {}}
        onMilestone={() => {}}
      />
    </LazyMotion>,
  );
  const titles = Array.from(document.querySelectorAll('[data-slot="card-title"]')).map(
    (node) => node.textContent,
  );
  expect(titles).toEqual(["One", "Active milestone", "Where the work is"]);
  expect(screen.getAllByRole("progressbar", { name: /milestone/ })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Planned milestone" })).not.toBeVisible();
  const moreDisclosure = screen.getByRole("button", { name: "1 more milestone" });
  expect(moreDisclosure).toHaveAttribute("aria-expanded", "false");
  await userEvent.setup().click(moreDisclosure);
  expect(moreDisclosure).toHaveAttribute("aria-expanded", "true");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Planned milestone" })).toBeVisible(),
  );
  expect(screen.getByText("Planned")).toBeVisible();
  const summary = screen.getByRole("button", { name: "1 shipped milestone" });
  expect(summary).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "Done milestone" })).not.toBeVisible();
  await userEvent.setup().click(summary);
  await waitFor(() => expect(screen.getByRole("button", { name: "Done milestone" })).toBeVisible());
  expect(summary).toHaveAttribute("aria-expanded", "true");
  await userEvent.setup().click(summary);
  expect(summary).toHaveAttribute("aria-expanded", "false");
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Done milestone" })).not.toBeVisible(),
  );
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
  const milestoneCard = screen.getByRole("heading", { name }).closest('[data-slot="card"]');
  expect(milestoneCard).not.toBeNull();
  expect(
    within(milestoneCard as HTMLElement).getByText("Progress may be incomplete"),
  ).toBeVisible();
  expect(screen.getByText("Work items").nextElementSibling).toHaveTextContent("0/1");
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
  expect(screen.getByText("Stints this week").nextElementSibling).toHaveTextContent("1");
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
  expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Active milestone" })).toHaveFocus();
});

test("shows all stage tracks, a neutral segment and the empty week alongside recent activity", () => {
  const snapshot = project({ ".scratch/one/spec.md": "# One" });
  snapshot.milestones = [{ id: "m", name: "Milestone", status: "active", workItemSlugs: ["one"] }];
  snapshot.workItems[0].milestone = "m";
  snapshot.workItems[0].stints = [
    {
      id: "old",
      agent: "codex",
      stage: "spec",
      status: "finished",
      startedAt: "2020-01-01T00:00:00Z",
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
  const stageCard = screen
    .getByRole("heading", { name: "Where the work is" })
    .closest('[data-slot="card"]') as HTMLElement;
  const tracks = within(stageCard)
    .getAllByRole("img")
    .filter((node) => node.getAttribute("aria-label")?.includes("Other"));
  expect(tracks).toHaveLength(6);
  const occupied = tracks.find((track) => track.getAttribute("aria-label")?.includes("Other 1"));
  expect(occupied?.lastElementChild).toHaveClass("bg-stopped");
  expect(occupied?.lastElementChild).toHaveStyle({ width: "100%" });
  expect(screen.getByText("No stints in the last 7 days")).toBeVisible();
  expect(screen.queryByRole("list", { name: "Last 7 days" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /One.*Spec/ })).toBeVisible();
  expect(screen.getByText("Stints this week").nextElementSibling).toHaveTextContent("0");
});

test("uses content-sized column stacks and hides the live status", () => {
  const snapshot = project({ ".scratch/one/spec.md": "# One" });
  const { container } = render(
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
  expect(screen.getByRole("status")).toHaveClass("sr-only");
  const cards = container.querySelectorAll('[data-slot="card"]');
  expect(cards.length).toBeGreaterThan(0);
  for (const card of cards) {
    expect(card.parentElement).toHaveAttribute("data-overview-column");
    expect(card.className).not.toMatch(/min-h-/);
  }
});

test("renders three columns at desktop width without a resize notification", () => {
  const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1440);
  try {
    const snapshot = project({ ".scratch/one/spec.md": "# One" });
    snapshot.milestones = [
      { id: "active", name: "Active milestone", status: "active", workItemSlugs: ["one"] },
    ];
    snapshot.workItems[0].milestone = "active";
    const { container } = render(
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
    expect(container.querySelectorAll("[data-overview-column]")).toHaveLength(3);
  } finally {
    width.mockRestore();
  }
});

test("keeps empty desktop columns as spacers for a single card", () => {
  const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1440);
  try {
    const snapshot = project({});
    snapshot.milestones = [
      { id: "active", name: "Active milestone", status: "active", workItemSlugs: [] },
    ];
    const { container } = render(
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
    const columns = container.querySelectorAll("[data-overview-column]");
    expect(columns).toHaveLength(3);
    expect(columns[0].querySelector('[data-slot="card"]')).toBeInTheDocument();
    expect(columns[1]).toBeEmptyDOMElement();
    expect(columns[2]).toBeEmptyDOMElement();
    expect(columns[1]).toHaveAttribute("aria-hidden", "true");
    expect(columns[2]).toHaveAttribute("aria-hidden", "true");
  } finally {
    width.mockRestore();
  }
});

test("reconnecting status and error share a visible callout", () => {
  render(
    <Overview
      snapshot={project({})}
      connection="reconnecting"
      error="Offline"
      onPipeline={() => {}}
      onOpenItem={() => {}}
      onNeedsYou={() => {}}
      onCreate={() => {}}
      onMilestone={() => {}}
    />,
  );
  const status = screen.getByRole("status");
  expect(status).toBeVisible();
  expect(status).toHaveTextContent("Reconnecting");
  expect(status.closest(".bg-attention-soft")).toContainElement(screen.getByRole("alert"));
  expect(screen.getByRole("alert")).toHaveTextContent("Offline");
});

test("empty state explains creation for each tracker", () => {
  const snapshot = project({});
  const props = {
    snapshot,
    connection: "live" as const,
    onPipeline: () => {},
    onOpenItem: () => {},
    onNeedsYou: () => {},
    onCreate: () => {},
    onMilestone: () => {},
  };
  const { rerender } = render(<Overview {...props} />);
  expect(
    screen.getByText("Work items hold a piece of work as it moves through a workflow."),
  ).toBeVisible();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "New work item" })).toBeVisible();
  snapshot.setup.tracker = "github-issues";
  rerender(<Overview {...props} />);
  expect(screen.getByText("Add issues on GitHub to see work items here.")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("stage swatches match segments and overview avoids chart and violet tokens", () => {
  const snapshot = project({ ".scratch/one/spec.md": "# One" });
  const { container } = render(
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
  const swatches = [...container.querySelectorAll("[data-stage-swatch]")];
  const track = screen
    .getAllByRole("img")
    .find((node) => node.getAttribute("aria-label")?.includes("Other"));
  if (!track) throw new Error("Missing stage track");
  expect(swatches).toHaveLength(3);
  expect(swatches.map((node) => node.className)).toEqual(
    [...track.children].map((node) => node.className),
  );
  expect(container.innerHTML).not.toMatch(/--overview-chart|bg-(?:violet|accent|chart-2)/);
});

test.each(Object.keys(kinds) as (keyof typeof kinds)[])(
  "attention row for %s uses its icon and work item title",
  (kind) => {
    const snapshot = project({ ".scratch/one/spec.md": "# One" });
    const base = attentionSnapshot().attentionItems[0];
    snapshot.attentionItems = [
      {
        ...base,
        kind,
        workItem: "one",
        stage: "spec",
        path: "AGENTS.md",
        warnings: [],
      } as ProjectSnapshot["attentionItems"][number],
    ];
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
    const card = screen.getByRole("heading", { name: /Needs you/ }).closest('[data-slot="card"]');
    if (!card) throw new Error("Missing attention card");
    const iconName = kinds[kind].icon.displayName;
    if (!iconName) throw new Error("Missing icon name");
    const iconClass = iconName.replace(
      /[A-Z]/g,
      (letter, i) => `${i ? "-" : ""}${letter.toLowerCase()}`,
    );
    const row = within(card as HTMLElement).getByRole("button", { name: /One/ });
    expect(row.querySelector(`.lucide-${iconClass}`)).toBeInTheDocument();
  },
);
