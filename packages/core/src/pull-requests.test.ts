// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import {
  createMemoryRepoFiles,
  indexProject,
  pullRequestText,
  workflowPullRequest,
  isPullRequest,
} from "./index.js";

test("PR title and body include spec, ticket outcome, review decisions and commit-bound checks", () => {
  const item = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First change\n\nKeep inputs safe.",
      ".scratch/first/issues/01-input.md": "# Validate input\nStatus: resolved\nBlocked by: none",
    }),
    { name: "Tests" },
  ).workItems[0];
  item.stints = [
    {
      id: "review",
      workItem: "first",
      stage: "review",
      ticket: null,
      agent: "codex",
      status: "finished",
      startedAt: "2026-10-10T10:00:00Z",
      endedAt: "2026-10-10T10:01:00Z",
      checkpointCommit: "a".repeat(40),
      handoff: null,
      findings: {
        commit: "a".repeat(40),
        findings: [
          {
            id: "finding",
            axis: "Spec",
            severity: "minor",
            path: "input.ts",
            line: 1,
            title: "Validate empty input",
            body: "Use a guard.",
          },
        ],
      },
    },
  ];
  item.reviewDecisions = [
    {
      kind: "finding",
      id: "finding",
      status: "accepted",
      at: "2026-10-10T10:02:00Z",
      by: "Developer",
      reason: "Not exposed",
    },
  ];
  item.checks = [
    {
      name: "Test",
      command: "node test.cjs",
      status: "passed",
      commit: "a".repeat(40),
      durationMs: 10,
      outputExcerpt: "passed",
    },
  ];
  expect(pullRequestText(item)).toEqual({
    title: "First change",
    body: `## Spec\n\n# First change\n\nKeep inputs safe.\n\n## Tickets\n\n- [x] 01: Validate input\n\n## Review\n\n- Validate empty input: accepted\n\n## Checks\n\n- Test: passed (${"a".repeat(40)})`,
  });
  item.github = {} as NonNullable<typeof item.github>;
  expect(pullRequestText(item).body).toContain("- [x] #1: Validate input");
  item.stints[0].findings = { commit: "a".repeat(40), findings: [] };
  expect(pullRequestText(item).body).toContain("No findings.");
});

test("PR workflow identity survives indexing; invalid remote identity and merge methods fail closed", () => {
  const pr = {
    number: 12,
    url: "https://github.com/example/project/pull/12",
    repo: "example/project",
    remote: "origin",
    remoteUrl: "git@github.com:example/project.git",
    branch: "stintwork/first",
    base: "main",
    headCommit: "a".repeat(40),
    mergeMethod: "squash" as const,
  };
  const text = workflowPullRequest("workflow: feature\nstage: ship\n", pr);
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First",
      ".scratch/first/workflow.yaml": text,
    }),
    { name: "Test" },
  );
  expect(snapshot.workItems[0].pullRequest).toEqual(pr);
  expect(snapshot.warnings).toEqual([]);
  expect(isPullRequest({ ...pr, url: "https://evil.invalid/pull/12" })).toBe(false);
  expect(isPullRequest({ ...pr, number: 0 })).toBe(false);
  expect(isPullRequest({ ...pr, mergeMethod: "admin" })).toBe(false);
  expect(() => workflowPullRequest("workflow: feature\nstage: review", pr)).toThrow("Ship");
});
