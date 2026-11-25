// SPDX-License-Identifier: Apache-2.0
import {
  applyStintLogEntry,
  createMemoryRepoFiles,
  indexProject,
  summarizeStint,
} from "@stintwork/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnimatePresence, domMax, LazyMotion, MotionGlobalConfig } from "motion/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { claudeProfile, codexProfile } from "../../agents/src/profiles";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { MarkShipped } from "./MarkShipped";
import { recoveryStint } from "./recovery-test-fixtures";
import { MotionRoot } from "./ui/MotionRoot";
import { WorkItemDrawer } from "./WorkItemDrawer";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

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
  expect(within(drawer).queryByRole("button", { name: "Language" })).not.toBeInTheDocument();
  const first = within(drawer).getByRole("button", { name: "Close work item" });
  first.focus();
  await user.tab({ shift: true });
  expect(drawer).toContainElement(document.activeElement as HTMLElement);
  await user.tab();
  expect(first).toHaveFocus();
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Esc to return to Pipeline");
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

test.each([false, true])(
  "dismissing a nested review leaves the drawer open (docked=%s)",
  async (docked) => {
    if (docked)
      vi.stubGlobal("matchMedia", () => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
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
    expect(
      screen.getByRole(docked ? "complementary" : "dialog", { name: "First" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close review" })).not.toBeInTheDocument();
  },
);

test("Escape immediately after the close tooltip disappears dismisses the drawer", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ agents: [] }))),
  );
  const user = userEvent.setup();
  render(<DrawerExample />);
  const opener = screen.getByRole("button", { name: "Inspect First" });
  await user.click(opener);
  const drawer = screen.getByRole("dialog", { name: "First" });
  await user.tab({ shift: true });
  await user.tab();
  const close = screen.getByRole("button", { name: "Close work item" });
  expect(close).toHaveFocus();
  const tooltip = await screen.findByRole("tooltip", { name: "Esc to return to Pipeline" });
  const nextEscape = vi.fn(() => {
    const drawerOpen = drawer.isConnected && drawer.getAttribute("data-state") === "open";
    const closeFocused = document.activeElement === close;
    const escapeEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    close.dispatchEvent(escapeEvent);
    return { drawerOpen, closeFocused, handled: escapeEvent.defaultPrevented };
  });
  const observer = new MutationObserver(() => {
    if (tooltip.isConnected) return;
    observer.disconnect();
    nextEscape();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  try {
    close.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "First" })).not.toBeInTheDocument(),
    );
    expect(nextEscape).toHaveBeenCalledOnce();
    expect(nextEscape).toHaveReturnedWith({ drawerOpen: true, closeFocused: true, handled: true });
    await waitFor(() => expect(opener).toHaveFocus());
  } finally {
    observer.disconnect();
  }
});

test("the drawer shows and copies the worktree path even when no stint is active", async () => {
  const user = userEvent.setup();
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  item.worktreePath = "/project-worktrees/first";
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(screen.getByText("Worktree")).toHaveAttribute(
    "title",
    "Work item files live in this worktree:",
  );
  expect(screen.getByText(item.worktreePath)).toHaveAttribute("data-truncate");
  expect(screen.getByText(item.worktreePath)).toHaveAttribute("title", item.worktreePath);
  await user.click(screen.getByRole("button", { name: `Copy ${item.worktreePath}` }));
  expect(await navigator.clipboard.readText()).toBe(item.worktreePath);
  expect(screen.getByRole("dialog")).toHaveTextContent("Copied");
});

test("the drawer does not claim a worktree for a main-checkout work item", async () => {
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(screen.queryByText("Worktree")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Spec" }));
  expect(screen.getByText(".scratch/first/spec.md")).toBeInTheDocument();
});

test("opening a GitHub drawer refreshes once, including after reopening", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn((url: string) =>
    url === "/api/agents"
      ? Promise.resolve(new Response(JSON.stringify({ agents: [] })))
      : new Promise<Response>((resolve) => {
          finish = resolve;
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  const refresh = vi.fn();
  window.addEventListener("stintwork:refresh-project", refresh);
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  item.github = {
    repository: "a/b",
    repositoryId: "R",
    issueId: "I",
    number: 1,
    url: "https://example.com/1",
    complete: true,
  };
  const view = render(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/github/items/1/refresh")).toHaveLength(
    1,
  );
  expect(fetcher).toHaveBeenCalledWith("/api/github/items/1/refresh", { method: "POST" });
  expect(screen.getByText("Refreshing…")).toBeInTheDocument();
  view.rerender(<WorkItemDrawer item={{ ...item }} onClose={() => {}} />);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/github/items/1/refresh")).toHaveLength(
    1,
  );
  finish(new Response("{}"));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  view.unmount();
  const reopened = render(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/github/items/1/refresh")).toHaveLength(
    2,
  );
  finish(new Response("{}"));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  reopened.unmount();
  window.removeEventListener("stintwork:refresh-project", refresh);
});

test("opening a GitHub drawer waits for the rate limit deadline", async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn(async (_url: string) => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
      name: "Project",
    }).workItems[0];
    item.github = {
      repository: "a/b",
      repositoryId: "R",
      issueId: "I",
      number: 1,
      url: "https://example.com/1",
      complete: true,
    };
    const view = render(
      <WorkItemDrawer
        item={item}
        onClose={() => {}}
        githubRetryAt={new Date(Date.now() + 1000).toISOString()}
      />,
    );
    expect(
      fetcher.mock.calls.filter(([url]) => url === "/api/github/items/1/refresh"),
    ).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1001);
    });
    expect(
      fetcher.mock.calls.filter(([url]) => url === "/api/github/items/1/refresh"),
    ).toHaveLength(1);
    view.unmount();
  } finally {
    vi.useRealTimers();
  }
});

test("local drawers do not refresh and GitHub refresh failure is shown", async () => {
  const fetcher = vi.fn(async (url: string) =>
    url === "/api/agents"
      ? new Response(JSON.stringify({ agents: [] }))
      : new Response(JSON.stringify({ reason: "Refresh failed" }), { status: 500 }),
  );
  vi.stubGlobal("fetch", fetcher);
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  const view = render(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(fetcher.mock.calls.some(([url]) => String(url).includes("/api/github/items/"))).toBe(
    false,
  );
  view.unmount();
  item.github = {
    repository: "a/b",
    repositoryId: "R",
    issueId: "I",
    number: 1,
    url: "https://example.com/1",
    complete: true,
  };
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Refresh failed");
});

test.each(["success", "closed", "exhausted"])(
  "drawer retries a conflicting refresh: %s",
  async (scenario) => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/agents") return new Response(JSON.stringify({ agents: [] }));
      const attempts = fetcher.mock.calls.filter(([path]) =>
        path.includes("/api/github/items/"),
      ).length;
      return new Response("{}", { status: scenario === "success" && attempts > 1 ? 200 : 409 });
    });
    vi.stubGlobal("fetch", fetcher);
    const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
      name: "Project",
    }).workItems[0];
    item.github = {
      repository: "a/b",
      repositoryId: "R",
      issueId: "I",
      number: 1,
      url: "https://example.com/1",
      complete: true,
    };
    const view = render(<WorkItemDrawer item={item} onClose={() => {}} />);
    await waitFor(() =>
      expect(fetcher.mock.calls.filter(([url]) => url.includes("/api/github/items/"))).toHaveLength(
        1,
      ),
    );
    if (scenario === "closed") {
      view.unmount();
      await new Promise((resolve) => setTimeout(resolve, 850));
      expect(fetcher.mock.calls.filter(([url]) => url.includes("/api/github/items/"))).toHaveLength(
        1,
      );
    } else {
      view.rerender(<WorkItemDrawer item={{ ...item }} onClose={() => {}} />);
      if (scenario === "success") {
        await waitFor(() =>
          expect(
            fetcher.mock.calls.filter(([url]) => url.includes("/api/github/items/")),
          ).toHaveLength(2),
        );
        await waitFor(() => expect(screen.queryByText("Refreshing…")).not.toBeInTheDocument());
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      } else {
        expect(await screen.findByRole("alert", {}, { timeout: 2000 })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(
          fetcher.mock.calls.filter(([url]) => url.includes("/api/github/items/")),
        ).toHaveLength(3);
      }
    }
  },
);

test("GitHub ticket numbers use issue format while local tickets keep Markdown format", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const item = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First",
      ".scratch/first/issues/02-model.md": "# Model\nStatus: open\nBlocked by: 01",
    }),
    { name: "Project" },
  ).workItems[0];
  const view = render(<WorkItemDrawer item={item} onClose={() => {}} />);
  await userEvent.click(screen.getByRole("tab", { name: "Tickets" }));
  expect(screen.getByText("02 · Model")).toBeInTheDocument();
  expect(screen.getByText(/Blocked by 01/)).toBeInTheDocument();
  item.github = {
    repository: "a/b",
    repositoryId: "R",
    issueId: "I",
    number: 1,
    url: "https://example.com/1",
    complete: true,
    ticketsKnown: true,
  };
  view.rerender(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(screen.getByText("#2 · Model")).toBeInTheDocument();
  expect(screen.getByText(/Blocked by #1/)).toBeInTheDocument();
  item.tickets[0].status = "unknown";
  view.rerender(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(screen.getByText("Unknown")).toBeInTheDocument();
  expect(screen.queryByText(/Blocked by #1/)).not.toBeInTheDocument();
});

test("shipped GitHub drawer does not show empty details until known", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  item.merged = { at: "2026-10-10T10:00:00Z", commit: "b".repeat(40) };
  item.spec = null;
  item.github = {
    repository: "a/b",
    repositoryId: "R",
    issueId: "I",
    number: 1,
    url: "https://example.com/1",
    complete: true,
  };
  const view = render(<WorkItemDrawer item={item} onClose={() => {}} />);
  await userEvent.click(screen.getByRole("tab", { name: "Spec" }));
  expect(screen.getByText("GitHub details are not available yet.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Tickets" }));
  expect(screen.getByText("GitHub details are not available yet.")).toBeInTheDocument();
  item.github.ticketsKnown = true;
  view.rerender(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(screen.getByText("No tickets yet.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Spec" }));
  expect(screen.getByText("No spec yet.")).toBeInTheDocument();
});

test("wide screens dock the detail, focus its close button and restore the opener on Escape", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const user = userEvent.setup();
  render(<DrawerExample />);
  const trigger = screen.getByRole("button", { name: "Inspect First" });
  await user.click(trigger);
  const panel = screen.getByRole("complementary", { name: "First" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(panel).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("complementary", { name: "First" })).not.toBeInTheDocument();
  await user.click(trigger);
  await user.click(
    within(screen.getByRole("complementary", { name: "First" })).getByRole("button", {
      name: "Close work item",
    }),
  );
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  trigger.focus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("complementary", { name: "First" })).not.toBeInTheDocument();
});

test.each([
  ["stage", "spec", false, false, false, "Start stint", 1],
  ["ticket", "implement", true, false, false, "Start stint", 1],
  ["review", "review", false, false, true, "Open review", 1],
  ["read-only", "spec", false, true, true, "Start stint", 0],
  ["shipped", "spec", false, false, true, "Open review", 0],
] as const)(
  "footer primary action follows available %s state",
  (state, stage, ticket, readOnly, worktree, action, count) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const item = indexProject(
      createMemoryRepoFiles({
        ".scratch/first/spec.md": "# First",
        ".scratch/first/workflow.yaml": `workflow: feature\nstage: ${stage}\n`,
        ...(ticket
          ? {
              ".scratch/first/issues/01-first.md":
                "# First ticket\nStatus: ready-for-agent\nBlocked by: none",
            }
          : {}),
      }),
      { name: "Project" },
    ).workItems[0];
    if (worktree) item.worktreePath = "/tree";
    if (state === "shipped") item.merged = { at: "2026-10-10T10:00:00Z", commit: "b".repeat(40) };
    const { container } = render(
      <WorkItemDrawer item={item} githubReadOnly={readOnly} onClose={() => {}} />,
    );
    const footer = container.ownerDocument.querySelector(".drawer-footer");
    expect(footer).not.toBeNull();
    if (!footer) throw new Error("Expected footer");
    const primary = footer.querySelectorAll(
      "button.bg-primary:not(:disabled), .footer-primary .brief-action > button:not(:disabled), .footer-primary > div > button:not(:disabled)",
    );
    expect(primary).toHaveLength(count);
    if (count) expect(primary[0]).toHaveAccessibleName(action);
    if (state === "ticket") expect(footer).toHaveTextContent("01 · First ticket");
  },
);

test.each([false, true])(
  "permission banner appears only in the Sheet (docked=%s)",
  async (docked) => {
    vi.stubGlobal("matchMedia", () => ({
      matches: docked,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
      name: "Project",
    }).workItems[0];
    const openNeedsYou = vi.fn();
    render(
      <WorkItemDrawer
        item={item}
        onClose={() => {}}
        pendingPermissions
        onOpenNeedsYou={openNeedsYou}
      />,
    );
    const banner = screen.queryByRole("button", {
      name: "Permission requests need your attention",
    });
    if (docked) expect(banner).not.toBeInTheDocument();
    else {
      expect(banner).toBeInTheDocument();
      if (banner) await userEvent.setup().click(banner);
      expect(openNeedsYou).toHaveBeenCalledOnce();
    }
  },
);

test("the disabled stage action retains its full accessible reason beside review", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const item = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First",
      ".scratch/first/workflow.yaml": "workflow: feature\nstage: spec\n",
    }),
    { name: "Project" },
  ).workItems[0];
  const active = applyStintLogEntry(null, {
    type: "started",
    at: "2026-10-09T10:00:00Z",
    stint: {
      id: "active",
      workItem: item.slug,
      stage: "spec",
      ticket: null,
      agent: "codex",
      worktree: { path: "/tree", branch: "first" },
      baseCommit: "base",
      brief: { skill: null, pointers: [], lastHandoff: null, changedPaths: [], prompt: "Brief" },
    },
  });
  if (!active) throw new Error("Expected active stint");
  item.activeStint = active;
  item.worktreePath = "/tree";
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  const start = screen.getByRole("button", { name: "Start stint" });
  const reason = "A stint is already active for this work item.";
  expect(start).toBeDisabled();
  expect(start).toHaveAccessibleDescription(reason);
  expect(screen.getByText(reason)).toHaveAttribute("title", reason);
  expect(screen.getByRole("button", { name: "Open review" })).toBeEnabled();
});

test("the header and footer remain bounded and scrollable in a short Sheet", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  render(<WorkItemDrawer item={item} onClose={() => {}} pendingPermissions />);
  const drawer = screen.getByRole("dialog", { name: "First" });
  const header = drawer.querySelector(".drawer-header");
  const footer = drawer.querySelector(".drawer-footer");
  expect(header).toHaveClass("max-h-[35%]", "overflow-y-auto");
  expect(footer).toHaveClass("max-h-[40%]", "overflow-y-auto");
});

test("the stage row shows its configured agent without a header avatar", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ agents: [claudeProfile, codexProfile] }))),
  );
  const item = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First",
      ".scratch/first/workflow.yaml":
        "workflow: feature\nstage: implement\nstages:\n  implement:\n    agent: claude\n",
    }),
    { name: "Project" },
  ).workItems[0];
  item.activeStint = { ...recoveryStint(), workItem: item.slug, agent: "codex" };
  render(<WorkItemDrawer item={item} agents={[claudeProfile, codexProfile]} onClose={() => {}} />);
  expect(document.querySelector(".drawer-identity img")).toBeNull();
  const row = screen.getByText("Agent for this stage").closest('[role="group"]');
  await waitFor(() => expect(row).toHaveTextContent("Claude Code"));
});

test("the identity branch follows active stint, pull request, most recent stint and worktree precedence", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ agents: [] }))),
  );
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  const stint = recoveryStint();
  const history = summarizeStint(stint);
  const older = {
    ...history,
    id: "older",
    startedAt: "2020-01-01T00:00:00Z",
    worktree: { ...stint.worktree, branch: "older-branch" },
  };
  const recent = { ...history, worktree: { ...stint.worktree, branch: "recent-branch" } };
  const pr = {
    number: 1,
    url: "https://example.com/pr",
    repo: "example/repo",
    remote: "origin",
    remoteUrl: "https://example.com/repo",
    branch: "pr-branch",
    base: "main",
    headCommit: "abc",
  };
  const view = render(
    <WorkItemDrawer
      item={{
        ...item,
        activeStint: { ...stint, worktree: { ...stint.worktree, branch: "active-branch" } },
        pullRequest: pr,
        stints: [recent, older],
        worktreePath: "/tree",
      }}
      onClose={() => {}}
    />,
  );
  const chip = () => document.querySelector(".drawer-identity code.rounded-full");
  expect(chip()).toHaveAttribute("title", "active-branch");
  view.rerender(
    <WorkItemDrawer
      item={{ ...item, pullRequest: pr, stints: [recent, older], worktreePath: "/tree" }}
      onClose={() => {}}
    />,
  );
  expect(chip()).toHaveAttribute("title", "pr-branch");
  view.rerender(
    <WorkItemDrawer
      item={{ ...item, stints: [recent, older], worktreePath: "/tree" }}
      onClose={() => {}}
    />,
  );
  expect(chip()).toHaveAttribute("title", "recent-branch");
  view.rerender(<WorkItemDrawer item={{ ...item, worktreePath: "/tree" }} onClose={() => {}} />);
  expect(chip()).toHaveAttribute("title", "stintwork/first");
  view.rerender(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(chip()).toBeNull();
});

test("the header omits an idle status and shows a stopped stint", () => {
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  const view = render(<WorkItemDrawer item={item} onClose={() => {}} />);
  const header = document.querySelector(".drawer-header");
  expect(header).not.toHaveTextContent("No active stint");
  view.rerender(
    <WorkItemDrawer
      item={{ ...item, stints: [{ ...summarizeStint(recoveryStint()), status: "stopped" }] }}
      onClose={() => {}}
    />,
  );
  expect(header).toHaveTextContent("stopped");
});

test("mark as shipped supports keyboard, cancellation, coded errors and confirmation", async () => {
  localStorage.setItem(languageStorageKey, "en");
  const user = userEvent.setup();
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  let attempts = 0;
  const fetcher = vi.fn(async (url: string) => {
    if (!url.endsWith("/mark-shipped")) return new Response("{}", { status: 200 });
    attempts++;
    return attempts === 1
      ? new Response(
          JSON.stringify({
            reason: "The commit could not be resolved.",
            reasonMessage: { code: "outside.unknownCommit" },
          }),
          { status: 409 },
        )
      : new Response(JSON.stringify({ merged: {} }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<WorkItemDrawer item={item} mainHead="abcdef123" onClose={() => {}} />);
  const trigger = screen.getByRole("button", { name: "Mark as shipped" });
  trigger.focus();
  await user.keyboard("{Enter}");
  let dialog = screen.getByRole("dialog", { name: "Mark as shipped" });
  expect(within(dialog).getByLabelText("Merge commit")).toHaveValue("abcdef123");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(trigger).toHaveFocus();
  await user.keyboard("{Enter}");
  dialog = screen
    .getAllByRole("dialog", { name: "Mark as shipped" })
    .find((entry) => entry.getAttribute("data-state") === "open") as HTMLElement;
  await user.click(within(dialog).getByRole("button", { name: "Mark as shipped" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "The commit could not be resolved.",
  );
  await user.click(within(dialog).getByRole("button", { name: "Mark as shipped" }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/work-items/first/mark-shipped",
      expect.objectContaining({ body: JSON.stringify({ commit: "abcdef123" }) }),
    ),
  );
  view.rerender(
    <WorkItemDrawer
      item={{
        ...item,
        merged: { at: "2026-01-01T00:00:00Z", commit: "a".repeat(40), outside: true },
      }}
      onClose={() => {}}
    />,
  );
  expect(screen.queryByRole("button", { name: "Mark as shipped" })).not.toBeInTheDocument();
  expect(screen.getByText(/Merged outside Stintwork/)).toBeInTheDocument();
  view.rerender(
    <WorkItemDrawer
      item={{ ...item, activeStint: { ...recoveryStint(), status: "running" } }}
      onClose={() => {}}
    />,
  );
  expect(screen.queryByRole("button", { name: "Mark as shipped" })).not.toBeInTheDocument();
  view.rerender(
    <WorkItemDrawer item={{ ...item, worktreePath: "/worktree" }} onClose={() => {}} />,
  );
  expect(screen.queryByRole("button", { name: "Mark as shipped" })).not.toBeInTheDocument();
  localStorage.removeItem(languageStorageKey);
});

test("tabs navigate by keyboard, show contents and select startable tickets", async () => {
  const user = userEvent.setup();
  const item = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/workflow.yaml": "workflow: feature\nstage: implement",
      ".scratch/first/spec.md": "# First\n\n## Scope\n\n### Details\n\n## Outcome",
      ".scratch/first/issues/01-next.md":
        "# Next\nStatus: ready-for-agent\nBlocked by: none\n\nNext body",
      ".scratch/first/issues/02-ready.md":
        "# Ready\nStatus: ready-for-agent\nBlocked by: none\n\nReady body",
      ".scratch/first/issues/03-blocked.md":
        "# Blocked\nStatus: open\nBlocked by: 01\n\nBlocked body",
      ".scratch/first/issues/04-done.md": "# Done\nStatus: resolved\nBlocked by: none\n\nDone body",
    }),
    { name: "Project" },
  ).workItems[0];
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  const overview = screen.getByRole("tab", { name: "Overview" });
  expect(overview).toHaveAttribute("aria-selected", "true");
  overview.focus();
  await user.keyboard("{ArrowRight}");
  expect(new URL(location.href).searchParams.get("tab")).toBe("spec");
  const disclosure = screen.getByText("Contents", { selector: "summary" }).parentElement;
  if (!disclosure) throw new Error("Missing contents disclosure");
  expect(disclosure).not.toHaveAttribute("open");
  await user.click(within(disclosure).getByText("Contents"));
  expect(disclosure).toHaveAttribute("open");
  const contents = within(disclosure).getByRole("navigation", { name: "Contents" });
  expect(within(contents).getByRole("button", { name: "Scope" })).toBeInTheDocument();
  expect(within(contents).getByRole("button", { name: "Outcome" })).toBeInTheDocument();
  expect(within(contents).getByRole("button", { name: "Details" })).toHaveClass("pl-4");
  const sideContents = screen.getAllByRole("navigation", { name: "Contents" })[1];
  expect(sideContents).toHaveClass("@[960px]:sticky");
  const heading = screen.getByText("Scope", { selector: '[data-markdown-heading="h2"]' });
  const scroll = disclosure.closest(".drawer-content");
  if (!scroll) throw new Error("Missing spec scroll container");
  vi.spyOn(heading, "getBoundingClientRect").mockReturnValue({ top: 200 } as DOMRect);
  vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue({ top: 50 } as DOMRect);
  await user.click(within(contents).getByRole("button", { name: "Scope" }));
  expect(scroll.scrollTop).toBe(150);
  expect(
    screen.getByText("Scope", { selector: '[data-markdown-heading="h2"]' }).closest(".markdown")
      ?.parentElement,
  ).toHaveClass("max-w-[72ch]");
  screen.getByRole("tab", { name: "Spec" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(new URL(location.href).searchParams.get("tab")).toBe("tickets");
  const tickets = within(screen.getByRole("tabpanel"));
  for (const name of ["Next", "Ready", "Blocked", "Done"])
    expect(tickets.getByText(new RegExp(`\\d+ · ${name}`))).toBeInTheDocument();
  expect(screen.queryByText("Ready body")).not.toBeInTheDocument();
  await user.click(screen.getByText("02 · Ready"));
  expect(screen.getByText("Ready body")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Start stint" })).toHaveLength(2);
  for (const name of ["01 · Next", "03 · Blocked", "04 · Done"]) {
    await user.click(tickets.getByText(name));
    expect(screen.getAllByRole("button", { name: "Start stint" })).toHaveLength(1);
  }
});

test("spec URL opens Spec and Quick omits Tickets", () => {
  window.history.replaceState(null, "", "/?item=first&tab=spec");
  const item = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First\n\n## Scope",
      ".scratch/first/workflow.yaml": "workflow: quick\nstage: do",
    }),
    { name: "Project" },
  ).workItems[0];
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(screen.getByRole("tab", { name: "Spec" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("tab", { name: "Tickets" })).not.toBeInTheDocument();
});

test("detail tabs keep their content in a scrollable flex column", async () => {
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  const { container } = render(<WorkItemDrawer item={item} onClose={() => {}} />);
  const drawer = screen.getByRole("dialog", { name: "First" });
  const root = drawer.querySelector('[data-slot="tabs"]');
  expect(root).toHaveClass("min-h-0", "flex-1", "flex-col");
  const meta = drawer.querySelector(".drawer-identity p[data-truncate]");
  expect(meta).toHaveAttribute("title", meta?.textContent);
  const tabs = within(drawer).getByRole("tablist");
  expect(tabs).toHaveClass("shrink-0", "border-b");
  for (const name of ["Overview", "Spec", "Tickets", "Stints"]) {
    await userEvent.click(within(drawer).getByRole("tab", { name }));
    expect(within(drawer).getByRole("tabpanel")).toHaveClass(
      "flex-1",
      "min-h-0",
      "overflow-y-auto",
    );
  }
  expect(container).not.toContainElement(drawer);
});

test.each([
  ["en", "Tickets", "Ready for agent", "Resolved", "Blocked by"],
  ["zh-CN", "工单", "待 Agent 处理", "已解决", "受阻于"],
])(
  "%s ticket rows localize statuses and omit resolved blockers",
  async (language, tabName, ready, resolved, blockedBy) => {
    localStorage.setItem(languageStorageKey, language);
    const item = indexProject(
      createMemoryRepoFiles({
        ".scratch/first/spec.md": "# First",
        ".scratch/first/issues/01-ready.md":
          "# Ready ticket\nStatus: ready-for-agent\nBlocked by: none",
        ".scratch/first/issues/02-done.md": "# Done ticket\nStatus: resolved\nBlocked by: 01",
      }),
      { name: "Project" },
    ).workItems[0];
    render(
      <LanguageProvider>
        <WorkItemDrawer item={item} onClose={() => {}} />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("tab", { name: tabName }));
    const panel = within(screen.getByRole("tabpanel"));
    const readyRow = panel.getByText("01 · Ready ticket").closest("li");
    const doneRow = panel.getByText("02 · Done ticket").closest("li");
    expect(readyRow).toHaveTextContent(ready);
    expect(doneRow).toHaveTextContent(resolved);
    expect(doneRow).not.toHaveTextContent(blockedBy);
    localStorage.removeItem(languageStorageKey);
  },
);

test("the mobile drawer finishes its entrance with motion enabled", async () => {
  MotionGlobalConfig.skipAnimations = false;
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ agents: [] }))),
    );
    const user = userEvent.setup();
    render(
      <MotionRoot>
        <DrawerExample />
      </MotionRoot>,
    );
    await user.click(screen.getByRole("button", { name: "Inspect First" }));
    const dialog = screen.getByRole("dialog", { name: "First" });
    await waitFor(
      () => {
        expect(dialog).toHaveStyle({ opacity: "1", transform: "none" });
      },
      { timeout: 2500 },
    );
  } finally {
    MotionGlobalConfig.skipAnimations = true;
  }
});

test("the mobile drawer enters when Motion features load after it mounts", async () => {
  MotionGlobalConfig.skipAnimations = false;
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ agents: [] }))),
    );
    let load!: (features: typeof domMax) => void;
    const features = () =>
      new Promise<typeof domMax>((resolve) => {
        load = resolve;
      });
    const user = userEvent.setup();
    render(
      <LazyMotion features={features} strict>
        <DrawerExample />
      </LazyMotion>,
    );
    await user.click(screen.getByRole("button", { name: "Inspect First" }));
    const dialog = screen.getByRole("dialog", { name: "First" });
    expect(dialog).toHaveStyle({ opacity: "1", transform: "none" });
    await act(async () => {
      load(domMax);
    });
    await waitFor(() => expect(dialog).toHaveStyle({ opacity: "1", transform: "none" }), {
      timeout: 2500,
    });
  } finally {
    MotionGlobalConfig.skipAnimations = true;
  }
});

test("mark shipped remains mounted during exit and returns focus", async () => {
  MotionGlobalConfig.skipAnimations = false;
  try {
    localStorage.setItem(languageStorageKey, "en");
    const user = userEvent.setup();
    render(
      <LazyMotion features={domMax} strict>
        <MarkShipped slug="first" />
      </LazyMotion>,
    );
    const trigger = screen.getByRole("button", { name: "Mark as shipped" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Mark as shipped" });
    await waitFor(() => expect(dialog).toHaveStyle({ opacity: "1" }), { timeout: 2500 });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(dialog).not.toBeInTheDocument(), { timeout: 2500 });
    expect(trigger).toHaveFocus();
  } finally {
    MotionGlobalConfig.skipAnimations = true;
    localStorage.removeItem(languageStorageKey);
  }
});

test("docked Escape collapses full screen before closing and restores focus", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const onClose = vi.fn();
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  function Example() {
    const [open, setOpen] = useState(false);
    const [full, setFull] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        {open && (
          <WorkItemDrawer
            item={item}
            full={full}
            onFullChange={setFull}
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          />
        )}
      </>
    );
  }
  const user = userEvent.setup();
  render(<Example />);
  const opener = screen.getByRole("button", { name: "Open" });
  await user.click(opener);
  await user.click(screen.getByRole("button", { name: "Expand to full screen" }));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Expand to full screen" })).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
  await waitFor(() => expect(opener).toHaveFocus());
});

test("an exiting docked drawer is inert and hidden while it remains mounted", () => {
  MotionGlobalConfig.skipAnimations = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(min-width: 1024px)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  const tree = (open: boolean, second = false) => (
    <LazyMotion features={domMax} strict>
      <button type="button">Open</button>
      <AnimatePresence>
        {open && <WorkItemDrawer key="first" item={item} onClose={() => {}} />}
        {second && <WorkItemDrawer key="second" item={item} onClose={() => {}} />}
      </AnimatePresence>
    </LazyMotion>
  );
  try {
    const view = render(tree(false));
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    view.rerender(tree(true));
    const drawer = view.container.querySelector(".work-item-drawer") as HTMLElement;
    expect(drawer).toContainElement(document.activeElement as HTMLElement);
    expect(drawer.parentElement).not.toHaveClass("absolute");
    view.rerender(tree(false));
    expect(drawer).toBeInTheDocument();
    expect(drawer.parentElement).toHaveClass("absolute", "right-0");
    expect(drawer).toHaveAttribute("data-exiting", "true");
    expect(drawer).toHaveAttribute("inert");
    expect(drawer).toHaveAttribute("aria-hidden", "true");
    expect(opener).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Close work item" })).not.toBeInTheDocument();
    view.unmount();
    const switching = render(tree(true));
    switching.rerender(tree(false, true));
    const drawers = switching.container.querySelectorAll(".work-item-drawer");
    expect(drawers).toHaveLength(2);
    expect(drawers[0].parentElement).toHaveClass("absolute");
    expect(drawers[0]).toHaveAttribute("inert");
    expect(drawers[0]).toHaveAttribute("aria-hidden", "true");
    expect(drawers[1].parentElement).not.toHaveClass("absolute");
  } finally {
    MotionGlobalConfig.skipAnimations = true;
  }
});

test("an exiting mobile drawer is inert and hidden while it remains mounted", () => {
  MotionGlobalConfig.skipAnimations = false;
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  const tree = (open: boolean) => (
    <LazyMotion features={domMax} strict>
      <AnimatePresence>
        {open && <WorkItemDrawer key="first" item={item} onClose={() => {}} />}
      </AnimatePresence>
    </LazyMotion>
  );
  try {
    const view = render(tree(true));
    const drawer = document.querySelector(".work-item-drawer") as HTMLElement;
    expect(drawer).toBeInTheDocument();
    view.rerender(tree(false));
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveAttribute("data-exiting", "true");
    expect(drawer).toHaveAttribute("inert");
    expect(drawer).toHaveAttribute("aria-hidden", "true");
  } finally {
    MotionGlobalConfig.skipAnimations = true;
  }
});

test.each(["clarify", "spec", "tickets", "implement", "review", "ship"])(
  "footer has one primary in %s",
  (stage) => {
    const item = indexProject(
      createMemoryRepoFiles({
        ".scratch/first/spec.md": "# First",
        ".scratch/first/workflow.yaml": `workflow: feature\nstage: ${stage}\n`,
        ".scratch/first/issues/01-first.md":
          "# First ticket\nStatus: ready-for-agent\nBlocked by: none",
      }),
      { name: "Project" },
    ).workItems[0];
    if (stage === "review") item.worktreePath = "/tree";
    render(<WorkItemDrawer item={item} onClose={() => {}} />);
    const footer = document.querySelector(".drawer-footer");
    expect(
      footer?.querySelectorAll(".footer-primary .brief-action > button, button.bg-primary"),
    ).toHaveLength(1);
  },
);

test("more actions opens customise workflow", async () => {
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  const customise = vi.fn();
  render(<WorkItemDrawer item={item} onClose={() => {}} onCustomiseWorkflow={customise} />);
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Customise Feature workflow" }),
  );
  expect(customise).toHaveBeenCalledWith("feature");
});

test.each(["pointer", "keyboard"])("%s opening focuses the appropriate target", async (input) => {
  const user = userEvent.setup();
  render(<DrawerExample />);
  const trigger = screen.getByRole("button", { name: "Inspect First" });
  if (input === "pointer") await user.click(trigger);
  else {
    trigger.focus();
    await user.keyboard("{Enter}");
  }
  const panel = screen.getByRole("dialog", { name: "First" });
  expect(
    input === "pointer" ? panel : within(panel).getByRole("button", { name: "Close work item" }),
  ).toHaveFocus();
});

test("overview defers gate details and agents while keeping summary and footer", async () => {
  MotionGlobalConfig.skipAnimations = false;
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  item.activeStint = { ...recoveryStint(), workItem: item.slug };
  try {
    const { container } = render(<WorkItemDrawer item={item} onClose={() => {}} />);
    expect(
      container.querySelector(".drawer-footer") ?? document.querySelector(".drawer-footer"),
    ).toBeInTheDocument();
    expect(screen.getByText(/conditions met/i)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /gate conditions/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Agents by stage")).not.toBeInTheDocument();
    expect(document.querySelector(".stint-stream")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("list", { name: /gate conditions/i })).toBeInTheDocument();
      expect(screen.getByText("Agents by stage")).toBeInTheDocument();
      expect(document.querySelector(".stint-stream")).toBeInTheDocument();
    });
  } finally {
    MotionGlobalConfig.skipAnimations = true;
  }
});
