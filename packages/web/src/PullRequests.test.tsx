// SPDX-License-Identifier: Apache-2.0
import {
  createMemoryRepoFiles,
  indexProject,
  type PullRequest,
  type PullRequestPreview,
} from "@stintwork/core";
import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ShipActions } from "./ShipActions";
import { ChecksPanel } from "./ChecksPanel";
import { PullRequestChecksPanel } from "./PullRequestChecksPanel";
import { Sheet, SheetContent, SheetTitle } from "./ui/Sheet";

function item() {
  return indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First",
      ".scratch/first/workflow.yaml": "workflow: feature\nstage: ship\n",
    }),
    { name: "Test" },
  ).workItems[0];
}
const pr: PullRequest = {
  number: 12,
  repo: "example/project",
  url: "https://github.com/example/project/pull/12",
  remote: "origin",
  remoteUrl: "git@github.com:example/project.git",
  branch: "stintwork/first",
  base: "main",
  headCommit: "a".repeat(40),
};
const preview: PullRequestPreview = {
  ...pr,
  title: "First change",
  body: "## Spec\nPublish carefully.\n\n## Checks\nTest: passed",
  confirmation: "confirmation-token",
};
const checks = {
  number: 12,
  headCommit: pr.headCommit,
  state: "OPEN",
  fetchedAt: "2026-10-10T10:00:00Z",
  checks: [{ name: "CI", bucket: "pending", link: "" }],
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test.each(["publish", "merge"])(
  "a pending %s preview restores its opener inside a sheet",
  async (kind) => {
    let finishPreview = (_response: Response) => {};
    const pendingPreview = new Promise<Response>((resolve) => {
      finishPreview = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => pendingPreview),
    );
    const ready = item();
    if (kind === "merge") {
      ready.headCommit = pr.headCommit;
      ready.stages.review = { approved: { commit: pr.headCommit } };
      ready.pullRequest = pr;
      ready.pullRequestChecks = { ...checks, checks: [{ name: "CI", bucket: "pass", link: "" }] };
    }
    render(
      <Sheet defaultOpen>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Work item</SheetTitle>
          <ShipActions item={ready} />
        </SheetContent>
      </Sheet>,
    );
    const user = userEvent.setup();
    const opener = screen.getByRole("button", {
      name: kind === "publish" ? "Open pull request" : "Merge pull request",
    });
    await user.click(opener);
    expect(opener).toBeDisabled();
    opener.blur();
    screen.getByRole("dialog", { name: "Work item" }).focus();
    finishPreview(
      new Response(JSON.stringify(kind === "publish" ? { preview } : { mergeMethod: "squash" })),
    );
    const confirmation = await screen.findByRole("dialog", {
      name: kind === "publish" ? "Confirm publishing pull request" : "Confirm pull request merge",
    });
    if (kind === "publish")
      within(confirmation).getByRole("region", { name: "Code block" }).focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(confirmation).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Work item" })).toBeVisible();
    await waitFor(() => expect(opener).toHaveFocus());
  },
);

test("Open pull request previews publishing; cancel does not publish, and confirmation carries the token", async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(url.endsWith("preview-pr") ? { preview } : { pullRequest: pr }),
        ),
    );
  vi.stubGlobal("fetch", fetch);
  render(<ShipActions item={item()} />);
  await user.click(screen.getByRole("button", { name: "Open pull request" }));
  const dialog = await screen.findByRole("dialog", { name: "Confirm publishing pull request" });
  expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  for (const text of [
    preview.remoteUrl,
    preview.branch,
    preview.title,
    preview.headCommit,
    "Publish carefully.",
  ])
    expect(dialog).toHaveTextContent(text);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain("preview-pr");
  await user.keyboard("{Escape}");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open pull request" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Open pull request" }));
  await user.click(
    await screen.findByRole("button", { name: "Confirm push and open pull request" }),
  );
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/work-items/first/ship/open-pr",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ confirmation: preview.confirmation }),
    }),
  );
  expect(await screen.findByRole("button", { name: "Merge pull request" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "View on GitHub" })).toHaveAttribute("href", pr.url);
  expect(screen.queryByRole("button", { name: "Merge locally" })).not.toBeInTheDocument();
});

test.each([false, true])(
  "adoption preview shows actual details and notice (non-default: %s)",
  async (warning) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            preview: {
              ...preview,
              title: "Existing title",
              body: "Existing pull request body",
              base: "release",
              existingPrUrl: pr.url,
              existingPrNumber: 12,
              parentNumber: 1,
              parentWillNotClose: warning,
            },
          }),
        ),
      ),
    );
    render(<ShipActions item={item()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Open pull request" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm publishing pull request" });
    for (const text of [
      "Existing title",
      "Existing pull request body",
      "release",
      "adopted unchanged",
      "#1",
      "default branch",
    ])
      expect(dialog).toHaveTextContent(text);
    expect(within(dialog).getByRole("link", { name: pr.url })).toHaveAttribute("href", pr.url);
    if (warning)
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Merging it will not close the parent issue.",
      );
    else expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  },
);

test("merge refusal is visible; retry reports the PR merge commit", async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ reason: "Every pull request CI check must pass" }), {
        status: 409,
      }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ mergeMethod: "squash" })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          merged: {
            at: "2026-10-10T10:10:00Z",
            commit: "b".repeat(40),
            pr: "12",
            method: "squash",
          },
        }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  const ready = item();
  ready.stages.review = { approved: { commit: pr.headCommit } };
  render(
    <ShipActions
      item={{
        ...ready,
        headCommit: pr.headCommit,
        pullRequest: pr,
        pullRequestChecks: { ...checks, checks: [{ name: "CI", bucket: "pass", link: "" }] },
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Merge pull request" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Every pull request CI check must pass",
  );
  await user.click(screen.getByRole("button", { name: "Merge pull request" }));
  expect(
    await screen.findByRole("dialog", { name: "Confirm pull request merge" }),
  ).toHaveTextContent("Merge method: squash");
  await user.click(screen.getByRole("button", { name: "Confirm squash merge" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    `Shipped through pull request #12 at ${"b".repeat(40)}`,
  );
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/work-items/first/ship/merge-pr",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ mergeMethod: "squash" }) }),
  );
});

test.each(["merge", "squash", "rebase"])(
  "Ship confirms the server-selected %s method; cancelling does not merge",
  async (mergeMethod) => {
    const user = userEvent.setup();
    const fetch = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({ mergeMethod })));
    vi.stubGlobal("fetch", fetch);
    const ready = item();
    ready.stages.review = { approved: { commit: pr.headCommit } };
    render(
      <ShipActions
        item={{
          ...ready,
          headCommit: pr.headCommit,
          pullRequest: { ...pr, mergeMethod: "merge" },
          pullRequestChecks: { ...checks, checks: [{ name: "CI", bucket: "pass", link: "" }] },
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Merge pull request" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm pull request merge" });
    expect(dialog).toHaveTextContent(`Merge method: ${mergeMethod}`);
    expect(dialog).toHaveTextContent("main");
    expect(
      within(dialog).getByRole("button", { name: `Confirm ${mergeMethod} merge` }),
    ).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/work-items/first/ship/preview-merge-pr",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

test("Ship displays the linear-history refusal without offering confirmation", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ reason: "main requires linear history (required_linear_history)" }),
        {
          status: 409,
        },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const ready = item();
  ready.stages.review = { approved: { commit: pr.headCommit } };
  render(
    <ShipActions
      item={{
        ...ready,
        headCommit: pr.headCommit,
        pullRequest: pr,
        pullRequestChecks: { ...checks, checks: [{ name: "CI", bucket: "pass", link: "" }] },
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Merge pull request" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("required_linear_history");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("merge is disabled for missing, nonpassing or stale PR CI even with an approved gate", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const approved = item();
  approved.stages.review = { approved: { commit: pr.headCommit } };
  const base = { ...approved, headCommit: pr.headCommit, pullRequest: pr };
  const view = render(<ShipActions item={base} />);
  expect(screen.getByRole("button", { name: "Merge pull request" })).toBeDisabled();
  view.rerender(<ShipActions item={{ ...base, pullRequestChecks: checks }} />);
  expect(screen.getByRole("button", { name: "Merge pull request" })).toBeDisabled();
  const passing = { ...checks, checks: [{ name: "CI", bucket: "pass", link: "" }] };
  view.rerender(<ShipActions item={{ ...base, pullRequestChecks: passing }} />);
  expect(screen.getByRole("button", { name: "Merge pull request" })).toBeEnabled();
  view.rerender(
    <ShipActions item={{ ...base, headCommit: "b".repeat(40), pullRequestChecks: passing }} />,
  );
  expect(screen.getByRole("button", { name: "Merge pull request" })).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
});

test("PR state and commit-bound CI appear beside local checks; on-demand refresh replaces evidence", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn().mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("pr-checks")
            ? {
                checks: {
                  ...checks,
                  fetchedAt: "2026-10-10T10:00:01Z",
                  checks: [{ name: "CI", bucket: "pass", link: "" }],
                },
              }
            : { commands: [], checks: [], headCommit: pr.headCommit, checkExecution: null },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  render(
    <ChecksPanel
      item={{
        ...item(),
        headCommit: pr.headCommit,
        pullRequest: pr,
        pullRequestChecks: checks,
        checks: [
          {
            name: "Local test",
            command: "node test.cjs",
            status: "passed",
            commit: pr.headCommit,
            durationMs: 10,
            outputExcerpt: "passed",
          },
        ],
      }}
    />,
  );
  expect(screen.getByRole("list", { name: "Latest checks" })).toHaveTextContent("Local test");
  const panel = screen.getByRole("region", { name: "Pull request CI checks" });
  expect(panel).toHaveTextContent("OPEN");
  expect(panel).toHaveTextContent(pr.headCommit);
  expect(screen.getByRole("list", { name: "PR CI results" })).toHaveTextContent("CI · pending");
  await user.click(screen.getByRole("button", { name: "Refresh PR checks" }));
  expect(await screen.findByRole("list", { name: "PR CI results" })).toHaveTextContent("CI · pass");
});

test("PR CI ignores older refresh responses and older item evidence", async () => {
  let finish = (_response: Response) => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const props = { ...item(), pullRequest: pr, pullRequestChecks: checks };
  const view = render(<PullRequestChecksPanel item={props} />);
  await userEvent.click(screen.getByRole("button", { name: "Refresh PR checks" }));
  const newer = {
    ...checks,
    headCommit: "b".repeat(40),
    fetchedAt: "2026-10-10T10:00:01Z",
    checks: [{ name: "CI", bucket: "fail", link: "" }],
  };
  view.rerender(<PullRequestChecksPanel item={{ ...props, pullRequestChecks: newer }} />);
  await act(async () =>
    finish(
      new Response(
        JSON.stringify({
          checks: { ...checks, checks: [{ name: "CI", bucket: "pass", link: "" }] },
        }),
      ),
    ),
  );
  expect(screen.getByRole("list", { name: "PR CI results" })).toHaveTextContent("CI · fail");
  view.rerender(<PullRequestChecksPanel item={{ ...props, pullRequestChecks: { ...checks } }} />);
  expect(screen.getByRole("list", { name: "PR CI results" })).toHaveTextContent("CI · fail");
});

test("PR CI keeps the latest observation across head changes and resets for another PR", async () => {
  const newer = {
    ...checks,
    headCommit: "b".repeat(40),
    fetchedAt: "2026-10-10T10:00:01Z",
    checks: [{ name: "New CI", bucket: "pass", link: "" }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ checks: newer }))),
  );
  const props = { ...item(), pullRequest: pr, pullRequestChecks: checks };
  const view = render(<PullRequestChecksPanel item={props} />);
  await userEvent.click(screen.getByRole("button", { name: "Refresh PR checks" }));
  await waitFor(() =>
    expect(screen.getByRole("list", { name: "PR CI results" })).toHaveTextContent("New CI"),
  );
  view.rerender(
    <PullRequestChecksPanel
      item={{
        ...props,
        pullRequest: { ...pr, headCommit: newer.headCommit },
        pullRequestChecks: { ...checks },
      }}
    />,
  );
  expect(screen.getByRole("list", { name: "PR CI results" })).toHaveTextContent("New CI");
  view.rerender(<PullRequestChecksPanel item={{ ...props, pullRequestChecks: undefined }} />);
  expect(screen.getByRole("list", { name: "PR CI results" })).toHaveTextContent("New CI");
  view.rerender(
    <PullRequestChecksPanel
      item={{ ...props, pullRequest: { ...pr, url: "https://github.com/other/project/pull/12" } }}
    />,
  );
  expect(screen.getByRole("list", { name: "PR CI results" })).toHaveTextContent("CI · pending");
});

test.each([
  { ...pr, number: 13 },
  { ...pr, url: "https://github.com/other/project/pull/12" },
  { ...pr, headCommit: "b".repeat(40) },
])(
  "PR CI aborts scheduled refresh when PR identity changes: $number $url $headCommit",
  async (nextPr) => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    const fetch = vi.fn(
      (_url: string, _options: RequestInit) =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const props = { ...item(), pullRequest: pr, pullRequestChecks: checks };
    const view = render(<PullRequestChecksPanel item={props} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    const nextChecks = {
      ...checks,
      number: nextPr.number,
      headCommit: nextPr.headCommit,
      fetchedAt: "2026-10-10T10:00:01Z",
      checks: [{ name: "New CI", bucket: "pending", link: "" }],
    };
    view.rerender(
      <PullRequestChecksPanel
        item={{ ...props, pullRequest: nextPr, pullRequestChecks: nextChecks }}
      />,
    );
    expect(signal.aborted).toBe(true);
    await act(async () => {
      finish(
        new Response(
          JSON.stringify({
            checks: { ...checks, checks: [{ name: "Old CI", bucket: "pass", link: "" }] },
          }),
        ),
      );
    });
    expect(screen.getByRole("list", { name: "PR CI results" })).toHaveTextContent("New CI");
    expect(screen.getByRole("list", { name: "PR CI results" })).not.toHaveTextContent("Old CI");
    expect(screen.getByRole("button", { name: "Refresh PR checks" })).toBeEnabled();
  },
);

test("PR CI ignores a response for a different PR", async () => {
  const responseChecks = {
    ...checks,
    number: 13,
    checks: [{ name: "Wrong CI", bucket: "pass", link: "" }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ checks: responseChecks }))),
  );
  render(
    <PullRequestChecksPanel item={{ ...item(), pullRequest: pr, pullRequestChecks: checks }} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Refresh PR checks" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Refresh PR checks" })).toBeEnabled(),
  );
  expect(screen.getByRole("list", { name: "PR CI results" })).not.toHaveTextContent("Wrong CI");
});

test("PR CI displays a refreshed remote head and marks it stale", async () => {
  const remoteHead = "b".repeat(40);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          checks: {
            ...checks,
            headCommit: remoteHead,
            fetchedAt: "2026-10-10T10:00:01Z",
            checks: [{ name: "New CI", bucket: "fail", link: "" }],
          },
        }),
      ),
    ),
  );
  render(
    <PullRequestChecksPanel
      item={{ ...item(), headCommit: pr.headCommit, pullRequest: pr, pullRequestChecks: checks }}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Refresh PR checks" }));
  const panel = screen.getByRole("region", { name: "Pull request CI checks" });
  await waitFor(() => expect(panel).toHaveTextContent("New CI · fail"));
  expect(panel).toHaveTextContent(remoteHead);
  expect(panel).toHaveTextContent("Stale");
});

test("PR CI refreshes slowly, stops after unmount, and marks stale head evidence", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ checks })));
  vi.stubGlobal("fetch", fetch);
  const view = render(
    <PullRequestChecksPanel
      item={{ ...item(), headCommit: "b".repeat(40), pullRequest: pr, pullRequestChecks: checks }}
    />,
  );
  expect(screen.getByRole("region", { name: "Pull request CI checks" })).toHaveTextContent("Stale");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(59_999);
  });
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("shipped PR history keeps CI evidence and merge method without refresh or merge buttons", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const shipped = {
    ...item(),
    pullRequest: pr,
    pullRequestChecks: checks,
    merged: {
      at: "2026-10-10T10:10:00Z",
      commit: "b".repeat(40),
      pr: "12",
      method: "squash" as const,
    },
  };
  render(
    <>
      <ShipActions item={shipped} />
      <PullRequestChecksPanel item={shipped} />
    </>,
  );
  expect(screen.getByRole("region", { name: "Ship actions" })).toHaveTextContent(
    "Pull request #12 (squash)",
  );
  expect(screen.queryByRole("button", { name: "Merge pull request" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refresh PR checks" })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

test("PR polling waits for a pending refresh and pauses during Ship", async () => {
  vi.useFakeTimers();
  let finish!: (response: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const props = { ...item(), pullRequest: pr, pullRequestChecks: checks };
  const view = render(<PullRequestChecksPanel item={props} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180_000);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Checking CI…" })).toBeDisabled();
  view.rerender(<PullRequestChecksPanel item={props} paused />);
  await act(async () => {
    finish(new Response(JSON.stringify({ checks })));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180_000);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  view.rerender(<PullRequestChecksPanel item={props} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  view.unmount();
});

test("Ship preview shows progress while GitHub evidence is checked", async () => {
  const user = userEvent.setup();
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  render(<ShipActions item={item()} />);
  await user.click(screen.getByRole("button", { name: "Open pull request" }));
  expect(screen.getByRole("status")).toHaveTextContent("Verifying GitHub evidence");
  await act(async () => {
    finish(new Response(JSON.stringify({ preview })));
  });
  expect(
    await screen.findByRole("dialog", { name: "Confirm publishing pull request" }),
  ).toBeVisible();
});
