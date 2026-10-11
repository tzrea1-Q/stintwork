// SPDX-License-Identifier: Apache-2.0
import type { CheckExecution, CheckResult, WorkItemChecks } from "@stintwork/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ChecksPanel } from "./ChecksPanel";

const commit = "a".repeat(40);
const commands = [{ name: "Test", command: "node test.js" }];
const result: CheckResult = {
  ...commands[0],
  commit,
  status: "passed",
  durationMs: 32,
  outputExcerpt: "proof",
};
const execution: CheckExecution = {
  id: "12345678-1234-1234-1234-123456789abc",
  workItem: "first",
  commit,
  startedAt: "2026-10-10T00:00:00Z",
  endedAt: null,
  results: [{ ...result, status: "running" }],
};
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
function evidence(checks: CheckResult[] = [result]): WorkItemChecks {
  return { headCommit: commit, commands, checks, checkExecution: null };
}
afterEach(() => vi.unstubAllGlobals());

test.each(["running", "passed", "failed", "cancelled"] as const)(
  "panel shows %s evidence, output, duration and its commit",
  async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(evidence([{ ...result, status }]))));
    render(<ChecksPanel item={{ slug: "first" }} />);
    const list = await screen.findByRole("list", { name: "Latest checks" });
    await waitFor(() => expect(list).toHaveTextContent(status));
    expect(list).toHaveTextContent(commit);
    expect(list).toHaveTextContent("32 ms");
    expect(list).toHaveTextContent("proof");
    expect(within(list).getByText("node test.js")).toBeInTheDocument();
  },
);

test("live checks update output, offer cancellation and become stale on a new branch head", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn().mockResolvedValue(reply(evidence()));
  vi.stubGlobal("fetch", fetch);
  const view = render(
    <ChecksPanel
      item={{
        slug: "first",
        checks: execution.results,
        checkExecution: execution,
        headCommit: commit,
      }}
    />,
  );
  await screen.findByText("running");
  expect(screen.getByRole("button", { name: "Run checks" })).toBeDisabled();
  view.rerender(
    <ChecksPanel
      item={{
        slug: "first",
        checks: [{ ...execution.results[0], outputExcerpt: "streamed before completion" }],
        checkExecution: execution,
        headCommit: commit,
      }}
    />,
  );
  expect(screen.getByRole("log")).toHaveTextContent("streamed before completion");
  fetch.mockImplementation(async (_url, options) =>
    options?.method === "POST" ? reply({ execution }, 202) : reply(evidence()),
  );
  await user.click(screen.getByRole("button", { name: "Cancel checks" }));
  expect(fetch).toHaveBeenCalledWith("/api/work-items/first/checks/cancel", { method: "POST" });
  view.rerender(
    <ChecksPanel
      item={{
        slug: "first",
        checks: [{ ...result, status: "cancelled" }],
        checkExecution: null,
        headCommit: "b".repeat(40),
      }}
    />,
  );
  expect(screen.getByText("Stale", { exact: false })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel checks" })).not.toBeInTheDocument();
});

test("starting checks sends an explicit action and displays active evidence", async () => {
  const user = userEvent.setup();
  let active = false;
  const fetch = vi.fn().mockImplementation(async (_url, options) => {
    if (options?.method === "POST") {
      active = true;
      return reply({ execution }, 202);
    }
    return reply(
      active ? { ...evidence(execution.results), checkExecution: execution } : evidence([]),
    );
  });
  vi.stubGlobal("fetch", fetch);
  render(<ChecksPanel item={{ slug: "first" }} />);
  await screen.findByText("No check evidence yet.");
  await user.click(screen.getByRole("button", { name: "Run checks" }));
  expect(fetch).toHaveBeenCalledWith("/api/work-items/first/checks", { method: "POST" });
  expect(await screen.findByText("running")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel checks" })).toBeEnabled();
});

test("checks use core freshness: bookkeeping stays fresh, code changes show the evidence commit", async () => {
  const body = {
    ...evidence(),
    headCommit: "b".repeat(40),
    evidenceChangedPaths: {
      [commit]: [".scratch/first/review.yaml", ".scratch/first/workflow.yaml"],
    },
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(body)));
  const view = render(<ChecksPanel item={{ slug: "first" }} />);
  await screen.findByText("passed");
  expect(screen.queryByText(/Stale/)).not.toBeInTheDocument();
  view.rerender(
    <ChecksPanel
      item={{ slug: "first", ...body, evidenceChangedPaths: { [commit]: ["src/example.ts"] } }}
    />,
  );
  const list = screen.getByRole("list", { name: "Latest checks" });
  expect(list).toHaveTextContent("Stale");
  expect(list).toHaveTextContent(commit);
});

test("a comparison fetched for an older head cannot keep new-head check evidence fresh", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(reply({ ...evidence(), evidenceChangedPaths: { [commit]: [] } })),
  );
  const view = render(<ChecksPanel item={{ slug: "first" }} />);
  await screen.findByText("passed");
  expect(screen.queryByText(/Stale/)).not.toBeInTheDocument();
  view.rerender(<ChecksPanel item={{ slug: "first", headCommit: "new head" }} />);
  expect(screen.getByRole("list", { name: "Latest checks" })).toHaveTextContent(`Stale${commit}`);
});

test("empty configuration and server errors do not present passing checks", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ...evidence([]), commands: [] })));
  const view = render(<ChecksPanel item={{ slug: "first" }} />);
  await screen.findByText("No checks configured.");
  expect(screen.getByRole("button", { name: "Run checks" })).toBeDisabled();
  vi.mocked(fetch).mockResolvedValue(reply({ reason: "No worktree" }, 409));
  view.rerender(<ChecksPanel item={{ slug: "second" }} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No worktree");
});

test("action failures are visible and leave retry enabled", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async (_url, options) =>
        options?.method === "POST"
          ? reply({ reason: "Commit worktree changes first" }, 409)
          : reply(evidence([])),
      ),
  );
  render(<ChecksPanel item={{ slug: "first" }} />);
  await screen.findByText("No check evidence yet.");
  await user.click(screen.getByRole("button", { name: "Run checks" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Commit worktree changes first");
  expect(screen.getByRole("button", { name: "Run checks" })).toBeEnabled();
});
