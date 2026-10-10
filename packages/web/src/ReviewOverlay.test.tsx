import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import type { DiffFile, DiffLine, WorkItemDiff } from "@stintwork/git";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ReviewDiff, ReviewOverlay } from "./ReviewOverlay";
import { WorkItemDrawer } from "./WorkItemDrawer";

const diff: WorkItemDiff = {
  branch: "stintwork/first",
  mainBranch: "main",
  mainCommit: "a".repeat(40),
  mergeBase: "b".repeat(40),
  headCommit: "c".repeat(40),
  files: [
    {
      path: "src/changed.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
      binary: false,
      hunks: [
        {
          header: "@@ -10,2 +10,2 @@ function example",
          oldStart: 10,
          oldCount: 2,
          newStart: 10,
          newCount: 2,
          lines: [
            { kind: "context", oldLine: 10, newLine: 10, text: "unchanged" },
            { kind: "removed", oldLine: 11, newLine: null, text: "old value" },
            {
              kind: "added",
              oldLine: null,
              newLine: 11,
              text: "<script>not HTML</script>",
              noNewline: true,
            },
          ],
        },
      ],
    },
    {
      path: "new-name.txt",
      oldPath: "old-name.txt",
      status: "renamed",
      additions: 0,
      deletions: 0,
      binary: false,
      hunks: [],
    },
    {
      path: "image.png",
      status: "added",
      additions: null,
      deletions: null,
      binary: true,
      hunks: [],
    },
  ],
};
const item = { slug: "first", title: "First work item" };

afterEach(() => vi.unstubAllGlobals());
function reply(body: unknown, status = 200) {
  return { ok: status === 200, json: async () => body };
}

test("the file list links to files and shows statuses, added/removed counts and binary metadata", () => {
  render(<ReviewDiff diff={diff} />);
  const files = screen.getByRole("navigation", { name: "Changed files" });
  const links = within(files).getAllByRole("link");
  expect(links).toHaveLength(3);
  expect(links[0]).toHaveTextContent("src/changed.ts");
  expect(links[0]).toHaveTextContent("modified");
  expect(within(links[0]).getByText("1 added lines").parentElement).toHaveTextContent("+1");
  expect(within(links[0]).getByText("1 removed lines").parentElement).toHaveTextContent("−1");
  expect(document.getElementById(links[0].getAttribute("href")?.slice(1) ?? "")).toHaveAttribute(
    "data-diff-path",
    "src/changed.ts",
  );
  expect(links[1]).toHaveTextContent("renamed");
  expect(links[2]).toHaveTextContent("Binary");
  expect(screen.getByText("old-name.txt → new-name.txt")).toBeInTheDocument();
  expect(screen.getByText("Renamed file — content not shown.")).toBeInTheDocument();
  expect(screen.getByText("Binary file — content not shown.")).toBeInTheDocument();
});

test("hunks render old/new numbers, distinguish additions/removals and escape file content", () => {
  render(<ReviewDiff diff={diff} />);
  const table = screen.getByRole("table", {
    name: "src/changed.ts: @@ -10,2 +10,2 @@ function example",
  });
  const rows = within(table).getAllByRole("row").slice(1);
  expect(
    rows.map((row) =>
      within(row)
        .getAllByRole("cell")
        .slice(0, 3)
        .map((cell) => cell.textContent),
    ),
  ).toEqual([
    ["10", "10", " "],
    ["11", "", "−"],
    ["", "11", "+"],
  ]);
  expect(rows[1]).toHaveClass("review-line-removed");
  expect(rows[2]).toHaveClass("review-line-added");
  expect(rows[2]).toHaveAttribute("data-new-line", "11");
  expect(rows[1]).toHaveAttribute("data-old-line", "11");
  expect(screen.getByText("<script>not HTML</script>")).toBeInTheDocument();
  expect(table.querySelector("script")).toBeNull();
  expect(screen.getByText("No newline at end of file")).toBeInTheDocument();
});

test("empty committed diffs and metadata-only file changes have explicit states", () => {
  const view = render(<ReviewDiff diff={{ ...diff, files: [] }} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "No changes between the merge base and the branch head.",
  );
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  view.rerender(
    <ReviewDiff
      diff={{ ...diff, files: [{ ...diff.files[0], hunks: [], additions: 0, deletions: 0 }] }}
    />,
  );
  expect(screen.getByText("No text hunks (file metadata changed).")).toBeInTheDocument();
});

test("the overlay fetches the work item diff, labels the exact commits and reserves evidence panels", async () => {
  const fetch = vi.fn().mockResolvedValue(reply(diff));
  vi.stubGlobal("fetch", fetch);
  render(<ReviewOverlay item={item} onClose={() => {}} />);
  expect(screen.getByRole("status")).toHaveTextContent("Reading the work item diff…");
  expect(await screen.findByText(diff.headCommit)).toBeInTheDocument();
  expect(screen.getByText(diff.mergeBase)).toBeInTheDocument();
  expect(screen.getByText("stintwork/first")).toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: item.title })).toHaveClass("review-overlay");
  expect(fetch).toHaveBeenCalledWith(
    "/api/work-items/first/diff",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(screen.getByRole("region", { name: "Findings" })).toHaveTextContent(
    "Review findings will appear here",
  );
  expect(screen.getByRole("region", { name: "Checks" })).toHaveTextContent(
    "Commit-scoped checks will appear here",
  );
  expect(screen.getByText(/staged and uncommitted changes are not included/)).toBeInTheDocument();
});

test("findings/checks slots and line findings can be supplied without changing the diff renderer", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(diff)));
  const lineFindings = vi.fn((_file: DiffFile, line: DiffLine, head: string) =>
    line.newLine === 11 ? <p>Finding at {head}</p> : null,
  );
  render(
    <ReviewOverlay
      item={item}
      onClose={() => {}}
      findings={<p>Findings from ticket 03</p>}
      checks={<p>Checks from ticket 05</p>}
      lineFindings={lineFindings}
    />,
  );
  const finding = await screen.findByText(`Finding at ${diff.headCommit}`);
  expect(finding.closest("tr")?.previousElementSibling).toHaveAttribute("data-new-line", "11");
  expect(screen.getByRole("region", { name: "Findings" })).toHaveTextContent(
    "Findings from ticket 03",
  );
  expect(screen.getByRole("region", { name: "Checks" })).toHaveTextContent("Checks from ticket 05");
  expect(lineFindings).toHaveBeenCalledWith(
    diff.files[0],
    diff.files[0].hunks[0].lines[2],
    diff.headCommit,
  );
});

test("API reasons and network errors are shown and refresh can retry", async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(reply({ reason: "This work item has no worktree to review." }, 409))
    .mockRejectedValueOnce(new Error("Project server is offline."))
    .mockResolvedValueOnce(reply({ ...diff, files: [] }));
  vi.stubGlobal("fetch", fetch);
  render(<ReviewOverlay item={item} onClose={() => {}} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This work item has no worktree to review.",
  );
  await user.click(screen.getByRole("button", { name: "Refresh diff" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Project server is offline.");
  await user.click(screen.getByRole("button", { name: "Refresh diff" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "No changes between the merge base and the branch head.",
    ),
  );
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("refresh displays the new branch head rather than presenting old diff data as current", async () => {
  const user = userEvent.setup();
  const headCommit = "d".repeat(40);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(reply(diff))
      .mockResolvedValueOnce(reply({ ...diff, headCommit, files: [] })),
  );
  render(<ReviewOverlay item={item} onClose={() => {}} />);
  await screen.findByText(diff.headCommit);
  await user.click(screen.getByRole("button", { name: "Refresh diff" }));
  expect(await screen.findByText(headCommit)).toBeInTheDocument();
  expect(screen.queryByText(diff.headCommit)).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("late responses from a previous work item cannot replace the currently opened diff", async () => {
  let complete: (response: ReturnType<typeof reply>) => void = () => {};
  const delayed = new Promise<ReturnType<typeof reply>>((resolve) => {
    complete = resolve;
  });
  const fetch = vi
    .fn()
    .mockReturnValueOnce(delayed)
    .mockResolvedValueOnce(reply({ ...diff, branch: "stintwork/second", files: [] }));
  vi.stubGlobal("fetch", fetch);
  const view = render(<ReviewOverlay item={item} onClose={() => {}} />);
  const signal = fetch.mock.calls[0][1].signal as AbortSignal;
  view.rerender(<ReviewOverlay item={{ slug: "second", title: "Second" }} onClose={() => {}} />);
  expect(await screen.findByText("stintwork/second")).toBeInTheDocument();
  expect(signal.aborted).toBe(true);
  complete(reply(diff));
  await waitFor(() => expect(screen.queryByText("stintwork/first")).not.toBeInTheDocument());
});

test("the drawer opens review only for a worktree, and Escape closes only review and restores focus", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(diff)));
  const workItem = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  const view = render(<WorkItemDrawer item={workItem} onClose={onClose} />);
  expect(screen.queryByRole("button", { name: "Open review" })).not.toBeInTheDocument();
  view.rerender(
    <WorkItemDrawer
      item={{ ...workItem, worktreePath: "/project-worktrees/first" }}
      onClose={onClose}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Open review" });
  await user.click(trigger);
  await screen.findByText(diff.headCommit);
  expect(screen.getByRole("button", { name: "Close review" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("button", { name: "Close review" })).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Close review" }));
  expect(screen.queryByRole("button", { name: "Close review" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
