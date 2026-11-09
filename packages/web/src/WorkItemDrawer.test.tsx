// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { WorkItemDrawer } from "./WorkItemDrawer";
import { LanguageProvider, languageStorageKey } from "./i18n/language";

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
