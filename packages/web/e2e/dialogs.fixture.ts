// SPDX-License-Identifier: Apache-2.0
import {
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  indexProject,
} from "@stintwork/core";
import type { WorkItemDiff } from "@stintwork/git";
import type { ReviewFinding, StintSummary } from "@stintwork/core";

export function gate() {
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release };
}

const files = createMemoryRepoFiles({
  "AGENTS.md": "Browser fixture conventions",
  ".scratch/dialog-item/spec.md": `# Dialog work item with a deliberately long bilingual title 工作项标题 ${"layout details ".repeat(5)}\n\n## Scope\n${"Developer-authored content 原文。 ".repeat(60)}`,
  ".scratch/dialog-item/workflow.yaml": "workflow: feature\nstage: spec\n",
  ".stintwork/roadmap.md": `## Long milestone name 里程碑 ${"planning details ".repeat(5)}\nId: first\nStatus: active\n- dialog-item\n\n## Next milestone\nId: next\nStatus: planned\n`,
});

export const dialogSnapshot = indexProject(files, { name: "Dialog browser fixture" });
dialogSnapshot.workItems[0].worktreePath = "/fixture/worktrees/dialog-item";
export const dialogItem = dialogSnapshot.workItems[0];
export const dialogBrief = {
  ...compileBrief({ files, workItem: dialogItem, stage: builtInWorkflows.feature.stages[1] }),
  prompt: `Developer-authored prompt 原文。\n${"Read the project files before changing code. 保留原文。\n".repeat(100)}`,
  changedPaths: [`src/${"long-path-segment/".repeat(20)}module.ts`],
};

export const dialogDiff: WorkItemDiff = {
  branch: "stintwork/dialog-item",
  mainBranch: "main",
  mainCommit: "a".repeat(40),
  mergeBase: "b".repeat(40),
  headCommit: "c".repeat(40),
  files: [
    {
      path: `src/${"long-path-segment/".repeat(12)}module.ts`,
      status: "modified",
      additions: 80,
      deletions: 0,
      binary: false,
      hunks: [
        {
          header: "@@ -0,0 +1,80 @@",
          oldStart: 0,
          oldCount: 0,
          newStart: 1,
          newCount: 80,
          lines: Array.from({ length: 80 }, (_, index) => ({
            kind: "added" as const,
            oldLine: null,
            newLine: index + 1,
            text: `const value = '${"long diff content 原文 ".repeat(100)}';`,
          })),
        },
      ],
    },
  ],
};

export const dialogFinding: ReviewFinding = {
  id: "fixture-review:1",
  axis: "Standards",
  severity: "major",
  path: dialogDiff.files[0].path,
  line: 1,
  title: `Validate developer-authored input 原文 ${"long finding title ".repeat(8)}`,
  body: "Unchecked developer input reaches the writer. 保留原文。 ".repeat(20),
};

export const dialogReview: StintSummary = {
  id: "fixture-review",
  workItem: dialogItem.slug,
  stage: "review",
  ticket: null,
  agent: "codex",
  status: "finished",
  startedAt: "2026-10-13T10:00:00Z",
  endedAt: "2026-10-13T10:05:00Z",
  checkpointCommit: dialogDiff.headCommit,
  handoff: null,
  findings: {
    commit: dialogDiff.headCommit,
    findings: [
      dialogFinding,
      {
        ...dialogFinding,
        id: "fixture-review:2",
        axis: "Spec",
        severity: "blocker",
        line: 100,
        title: "Finding outside the hunk 原文",
      },
      {
        ...dialogFinding,
        id: "fixture-review:3",
        path: `src/${"outside-diff/".repeat(30)}file.ts`,
        title: "Finding outside the diff 原文",
      },
    ],
  },
};
