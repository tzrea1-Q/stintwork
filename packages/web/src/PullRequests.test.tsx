import {
  createMemoryRepoFiles,
  indexProject,
  type PullRequest,
  type PullRequestPreview,
} from "@stintwork/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ShipActions } from "./ShipActions";
import { ChecksPanel } from "./ChecksPanel";
import { PullRequestChecksPanel } from "./PullRequestChecksPanel";

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
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
  const fetch = vi
    .fn()
    .mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith("pr-checks")
              ? { checks: { ...checks, checks: [{ name: "CI", bucket: "pass", link: "" }] } }
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
