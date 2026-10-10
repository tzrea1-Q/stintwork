import {
  createMemoryRepoFiles,
  indexProject,
  type ReviewDecision,
  type ReviewFinding,
  type ReviewFindings,
} from "@stintwork/core";
import type { WorkItemDiff } from "@stintwork/git";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ReviewOverlay } from "./ReviewOverlay";

const diff: WorkItemDiff = {
  branch: "stintwork/example",
  mainBranch: "main",
  mainCommit: "main",
  mergeBase: "base",
  headCommit: "reviewed",
  files: [
    {
      path: "src/file.ts",
      status: "modified",
      binary: false,
      additions: 1,
      deletions: 1,
      hunks: [
        {
          header: "@@ -10,2 +10,2 @@",
          oldStart: 10,
          oldCount: 2,
          newStart: 10,
          newCount: 2,
          lines: [
            { kind: "context", oldLine: 10, newLine: 10, text: "context" },
            { kind: "removed", oldLine: 11, newLine: null, text: "old" },
            { kind: "added", oldLine: null, newLine: 11, text: "new" },
          ],
        },
      ],
    },
  ],
};
const finding: ReviewFinding = {
  id: "review:1",
  axis: "Standards",
  severity: "major",
  path: "src/file.ts",
  line: 11,
  title: "Validate input",
  body: "Unchecked input reaches the writer.",
};
function item(reports: ReviewFindings[] = [], decisions: ReviewDecision[] = []) {
  const files: Record<string, string> = {
    ".scratch/example/spec.md": "# Example",
    ".scratch/example/workflow.yaml": "workflow: feature\nstage: review\n",
  };
  for (const [index, report] of reports.entries())
    files[`.stintwork/local/stints/review-${index}.jsonl`] = [
      {
        type: "started",
        at: "2026-10-10T10:00:00Z",
        stint: {
          id: `review-${index}`,
          workItem: "example",
          stage: "review",
          ticket: null,
          agent: "codex",
          worktree: { path: "/project-worktrees/example", branch: "stintwork/example" },
          baseCommit: report.commit,
          brief: {
            skill: "/code-review",
            prompt: "Review",
            pointers: [],
            changedPaths: [],
            lastHandoff: null,
          },
        },
      },
      { type: "ended", at: "2026-10-10T10:00:01Z", status: "finished", findings: report },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n");
  return {
    ...indexProject(createMemoryRepoFiles(files), { name: "Project" }).workItems[0],
    reviewDecisions: decisions,
  };
}
function show(reports: ReviewFindings[], decisions: ReviewDecision[] = [], files = diff.files) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...diff, files }) }),
  );
  return render(<ReviewOverlay item={item(reports, decisions)} onClose={() => {}} />);
}
afterEach(() => vi.unstubAllGlobals());

test.each(["open", "resolved", "accepted", "sent-back"] as const)(
  "filters %s finding decisions",
  async (status) => {
    const user = userEvent.setup();
    show(
      [
        {
          commit: "reviewed",
          findings: [finding, { ...finding, id: "review:2", title: "Other finding" }],
        },
      ],
      [
        {
          kind: "finding",
          id: finding.id,
          status,
          reason: "Developer reason",
          by: "Developer",
          at: "2026-10-10T10:00:00Z",
        },
        {
          kind: "finding",
          id: "review:2",
          status: status === "open" ? "resolved" : "open",
          reason: "",
          by: "Developer",
          at: "2026-10-10T10:00:00Z",
        },
      ],
    );
    await screen.findByRole("article", { name: "Validate input" });
    const rail = within(screen.getByRole("region", { name: "Findings" }));
    await user.selectOptions(rail.getByRole("combobox", { name: "Status" }), status);
    expect(rail.getAllByRole("link")).toHaveLength(1);
    expect(rail.getByRole("link", { name: "Validate input" })).toBeInTheDocument();
  },
);

test("findings pin below new-side lines only; out-of-diff findings appear before the hunks and absent files stay visible", async () => {
  show([
    {
      commit: "reviewed",
      findings: [
        finding,
        { ...finding, id: "review:2", line: 40, title: "Outside hunk" },
        { ...finding, id: "review:3", path: "src/unchanged.ts", title: "Unchanged file" },
        { ...finding, id: "review:4", line: 10, title: "Context line" },
      ],
    },
  ]);
  const pinned = await screen.findByRole("article", { name: "Validate input" });
  expect(pinned.closest("tr")?.previousElementSibling).toHaveAttribute("data-new-line", "11");
  const context = screen.getByRole("article", { name: "Context line" });
  expect(context.closest("tr")?.previousElementSibling).toHaveAttribute("data-new-line", "10");
  expect(document.querySelector("tr[data-old-line='11']")?.nextElementSibling).toHaveAttribute(
    "data-new-line",
    "11",
  );
  const outside = screen.getByRole("article", { name: "Outside hunk" });
  expect(outside.closest(".review-outside")?.nextElementSibling).toHaveClass("review-hunk");
  expect(outside.closest("tr")).toBeNull();
  expect(
    screen.getByRole("article", { name: "Unchanged file" }).closest("section"),
  ).toHaveAttribute("data-diff-path", "src/unchanged.ts");
  const rail = within(screen.getByRole("region", { name: "Findings" }));
  expect(rail.getByRole("link", { name: "Validate input" })).toHaveAttribute(
    "href",
    `#${pinned.id}`,
  );
});

test("the rail combines axis, severity and status filters without hiding pinned evidence", async () => {
  const user = userEvent.setup();
  show(
    [
      {
        commit: "reviewed",
        findings: [
          finding,
          { ...finding, id: "review:2", axis: "Spec", severity: "minor", title: "Spec finding" },
          {
            ...finding,
            id: "review:3",
            axis: "Spec",
            severity: "minor",
            title: "Resolved finding",
          },
        ],
      },
    ],
    [
      {
        kind: "memory-proposal",
        id: "review:3",
        status: "accepted",
        reason: "Memory",
        by: "Developer",
        at: "2026-10-10T10:00:00Z",
      },
      {
        kind: "finding",
        id: "review:3",
        status: "resolved",
        reason: "Fixed",
        by: "Developer",
        at: "2026-10-10T10:00:00Z",
      },
    ],
  );
  await screen.findByRole("article", { name: "Validate input" });
  const rail = within(screen.getByRole("region", { name: "Findings" }));
  await user.selectOptions(rail.getByRole("combobox", { name: "Axis" }), "Spec");
  expect(rail.queryByRole("link", { name: "Validate input" })).not.toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Validate input" })).toBeInTheDocument();
  await user.selectOptions(rail.getByRole("combobox", { name: "Severity" }), "minor");
  await user.selectOptions(rail.getByRole("combobox", { name: "Status" }), "resolved");
  expect(rail.getAllByRole("link")).toHaveLength(1);
  expect(rail.getByRole("link", { name: "Resolved finding" })).toBeInTheDocument();
  expect(
    within(screen.getByRole("article", { name: "Resolved finding" })).getByText("Reason: Fixed"),
  ).toBeInTheDocument();
  await user.selectOptions(rail.getByRole("combobox", { name: "Severity" }), "blocker");
  expect(rail.getByRole("status")).toHaveTextContent("No findings match these filters.");
});

test("an explicit no-findings review and a parse failure are distinct, with commit and safe raw reply", async () => {
  const user = userEvent.setup();
  const raw = "<script>private reply</script>\nMalformed findings";
  show([
    { commit: "old", findings: [] },
    { commit: "reviewed", findings: null, error: "Required headings missing", rawReply: raw },
  ]);
  const rail = within(screen.getByRole("region", { name: "Findings" }));
  expect(rail.getByRole("status")).toHaveTextContent("No findings");
  expect(rail.getByRole("alert")).toHaveTextContent("Required headings missing");
  await user.click(rail.getByText("Raw findings reply"));
  expect(rail.getByText(/private reply/)).toHaveTextContent(raw.replace("\n", " "));
  expect(document.querySelector("script")).toBeNull();
  await screen.findByText("reviewed", { selector: ".review-range code" });
  expect(rail.getByText(/Stale/)).toHaveTextContent("old");
});

test("findings for an unchanged file still render when the committed diff is empty", async () => {
  show([{ commit: "old", findings: [finding] }], [], []);
  expect(await screen.findByRole("article", { name: "Validate input" })).toHaveTextContent("Stale");
  expect(screen.getByRole("navigation", { name: "Changed files" })).toHaveTextContent(
    "src/file.ts",
  );
});

test.each(["renamed", "added"] as const)(
  "metadata-only %s files keep findings at the file top",
  async (status) => {
    show(
      [{ commit: "reviewed", findings: [finding] }],
      [],
      [
        {
          path: finding.path,
          status,
          ...(status === "renamed" ? { oldPath: "src/old.ts" } : {}),
          binary: status === "added",
          additions: null,
          deletions: null,
          hunks: [],
        },
      ],
    );
    const card = await screen.findByRole("article", { name: "Validate input" });
    expect(card.closest(".review-outside")).not.toBeNull();
    expect(card.closest("tr")).toBeNull();
  },
);
