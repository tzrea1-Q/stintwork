// SPDX-License-Identifier: Apache-2.0
import { applyStintLogEntry, createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { WorkItemDrawer } from "./WorkItemDrawer";

afterEach(() => vi.unstubAllGlobals());

test.each([
  ["en", "Local Markdown tracker", "GitHub Issues tracker"],
  ["zh-CN", "本地 Markdown 跟踪器", "GitHub Issues 跟踪器"],
])("%s drawer footer identifies the tracker", (language, local, github) => {
  localStorage.setItem(languageStorageKey, language);
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  const { rerender } = render(
    <LanguageProvider>
      <WorkItemDrawer item={item} onClose={() => {}} />
    </LanguageProvider>,
  );
  expect(screen.getByText(local)).toBeInTheDocument();
  item.github = {
    repository: "github/gh-aw",
    repositoryId: "R",
    issueId: "I",
    number: 1433,
    url: "https://github.com/github/gh-aw/issues/1433",
    complete: false,
  };
  rerender(
    <LanguageProvider>
      <WorkItemDrawer item={item} onClose={() => {}} />
    </LanguageProvider>,
  );
  expect(screen.getByText(github)).toBeInTheDocument();
  expect(screen.queryByText(local)).not.toBeInTheDocument();
  localStorage.removeItem(languageStorageKey);
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
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Close work item");
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
  const tooltip = await screen.findByRole("tooltip", { name: "Close work item" });
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

test("GitHub ticket numbers use issue format while local tickets keep Markdown format", () => {
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
  expect(screen.getByText("unknown")).toBeInTheDocument();
  expect(screen.queryByText(/Blocked by #1/)).not.toBeInTheDocument();
});

test("shipped GitHub drawer does not show empty details until known", () => {
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
  expect(screen.queryByText("No spec yet.")).not.toBeInTheDocument();
  expect(screen.queryByText("No tickets yet.")).not.toBeInTheDocument();
  expect(screen.getAllByText("GitHub details are not available yet.")).toHaveLength(2);
  item.github.ticketsKnown = true;
  view.rerender(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(screen.getByText("No spec yet.")).toBeInTheDocument();
  expect(screen.getByText("No tickets yet.")).toBeInTheDocument();
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
  expect(within(panel).getByRole("button", { name: "Close work item" })).toHaveFocus();
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
  ["review", "ship", false, false, true, "Open review", 1],
  ["read-only", "spec", false, true, true, "Open review", 0],
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
