// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { composeWorkItemFiles, createMemoryRepoFiles, indexProject } from "./index.js";

test("indexes active work-item folders from worktrees and everything else from main", () => {
  const main = createMemoryRepoFiles({
    ".scratch/active/spec.md": "# Main spec",
    ".scratch/active/issues/01-first.md": "# First\nStatus: open\nBlocked by: none",
    ".scratch/active/issues/02-next.md": "# Next\nStatus: open\nBlocked by: 01",
    ".scratch/active/issues/03-deleted.md": "# Deleted\nStatus: open\nBlocked by: none",
    ".scratch/active/workflow.yaml": "workflow: feature\nstage: spec",
    ".scratch/active-other/spec.md": "# Another work item",
    ".scratch/inactive/spec.md": "# Inactive",
    ".stintwork/roadmap.md": "## Main milestone\nId: m1\nStatus: active\n- active",
    "AGENTS.md": "Main conventions",
    "GLOSSARY.md": "Main glossary",
    "docs/adr/0001-files.md": "# Main decision",
    ".stintwork/local/stints/previous.jsonl": "Main stint log",
  });
  const worktree = createMemoryRepoFiles({
    ".scratch/active/spec.md": "# Worktree spec",
    ".scratch/active/issues/01-first.md": "# First\nStatus: resolved\nBlocked by: none",
    ".scratch/active/issues/02-next.md": "# Next\nStatus: open\nBlocked by: 01",
    ".scratch/active/issues/04-added.md": "# Added\nStatus: open\nBlocked by: none",
    ".scratch/active/workflow.yaml": "workflow: quick\nstage: do",
    ".scratch/inactive/spec.md": "# Must not replace inactive",
    ".stintwork/roadmap.md": "Must not replace roadmap",
    "AGENTS.md": "Must not replace conventions",
    "GLOSSARY.md": "Must not replace glossary",
    "docs/adr/0002-wrong.md": "Must not add decisions",
    ".stintwork/local/stints/previous.jsonl": "Must not replace logs",
  });
  const files = composeWorkItemFiles(main, new Map([["active", worktree]]));
  const snapshot = indexProject(files, { name: "Project" });
  expect(snapshot.workItems).toMatchObject([
    {
      slug: "active",
      title: "Worktree spec",
      workflow: "quick",
      stage: "do",
      milestone: "m1",
      tickets: [{ resolved: true }, { number: 2, blocked: false }, { number: 4 }],
    },
    { slug: "active-other", title: "Another work item" },
    { slug: "inactive", title: "Inactive" },
  ]);
  expect(files.read(".scratch/active/issues/03-deleted.md")).toBeUndefined();
  expect(files.list(".scratch/active/issues/")).toHaveLength(3);
  for (const path of [
    "AGENTS.md",
    "GLOSSARY.md",
    ".stintwork/roadmap.md",
    ".stintwork/local/stints/previous.jsonl",
  ])
    expect(files.read(path)).toBe(main.read(path));
  expect(files.list("docs/adr/")).toEqual(["docs/adr/0001-files.md"]);
});

test("does not resurrect main files deleted from the worktree, and includes worktree-only work items", () => {
  const files = composeWorkItemFiles(
    createMemoryRepoFiles({ ".scratch/deleted/spec.md": "# Deleted" }),
    new Map([
      ["deleted", createMemoryRepoFiles({})],
      ["new", createMemoryRepoFiles({ ".scratch/new/spec.md": "# New" })],
    ]),
  );
  expect(indexProject(files, { name: "Project" }).workItems).toMatchObject([{ slug: "new" }]);
  expect(files.read(".scratch/deleted/spec.md")).toBeUndefined();
  expect(files.list("")).toEqual([".scratch/new/spec.md"]);
});
