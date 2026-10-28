// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryRepoFiles, githubEvidenceDigest, indexProject } from "@stintwork/core";
import { expect, test } from "vitest";
import { githubSnapshotFiles, projectGithubGates } from "./github-snapshot.js";
import type { ProjectFilesReader } from "./work-item-files.js";

test("projects workflow records and fresh, stale and unknown approval evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "github-snapshot-"));
  try {
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--allow-empty",
      "-qm",
      "initial",
    ]);
    const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const digest = await githubEvidenceDigest(
      { parentId: "I_1", body: "Spec", tickets: [] },
      false,
    );
    const files = createMemoryRepoFiles({
      "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n",
      ".stintwork/github/example/project/1/workflow.yaml": `workflow: feature\nstage: tickets\nstages:\n  clarify:\n    approved:\n      remote: { version: 1, parentId: I_1, digest: '${digest}' }\n  spec:\n    approved:\n      remote: { version: 1, parentId: I_1, digest: 'old' }\n`,
    });
    const github = {
      repository: "Example/Project",
      repositoryId: "R_1",
      items: [
        {
          id: "I_1",
          number: 1,
          title: "Parent",
          url: "https://github.com/Example/Project/issues/1",
          bound: true,
          complete: true,
          detail: { spec: "Spec", tickets: [], complete: true },
        },
      ],
      scanned: 1,
      cursor: null,
      complete: true,
      pages: [],
      warnings: [],
    };
    const project = {
      files,
      worktreePaths: new Map(),
      watchPaths: [],
      warnings: [],
    } as ReturnType<ProjectFilesReader>;
    const snapshot = indexProject(files, { name: "Test", github });
    projectGithubGates(snapshot, root, project);
    const item = snapshot.workItems[0];
    expect(item).toMatchObject({
      workflow: "feature",
      stage: "tickets",
      stages: {
        clarify: { approved: { remoteState: "current" } },
        spec: { approved: { remoteState: "stale" } },
      },
      github: {
        reviewDigest: await githubEvidenceDigest(
          { parentId: "I_1", body: "Spec", tickets: [] },
          true,
        ),
        reviewHead: head,
      },
    });
    const branch = join(root, "branch");
    const workflowPath = ".stintwork/github/example/project/1/workflow.yaml";
    mkdirSync(join(branch, ".stintwork/github/example/project/1"), { recursive: true });
    writeFileSync(join(branch, workflowPath), "different record\n");
    const divergent = indexProject(files, { name: "Test", github });
    projectGithubGates(divergent, root, {
      ...project,
      worktreePaths: new Map([["github-1", branch]]),
    });
    expect(divergent.warnings).toContainEqual({
      path: workflowPath,
      message: expect.stringContaining("differ"),
    });
    const reviewSnapshot = indexProject(files, { name: "Test", github });
    const reviewItem = reviewSnapshot.workItems[0];
    const ticketDigest = await githubEvidenceDigest(
      { parentId: "I_1", body: "Spec", tickets: [] },
      true,
    );
    const approval = {
      by: "Test",
      at: "2026-01-01T00:00:00Z",
      commit: head,
      remote: { version: 1, parentId: "I_1", digest: ticketDigest },
    };
    reviewItem.stages.spec.approved = { ...approval, remote: { ...approval.remote, digest } };
    reviewItem.stages.tickets = { approved: approval };
    reviewItem.stages.implement = { approved: approval };
    reviewItem.stages.review = { approved: approval };
    reviewItem.stage = "ship";
    projectGithubGates(reviewSnapshot, root, project);
    expect(reviewItem.stages.review.approved).toMatchObject({ remoteState: "current" });
    writeFileSync(join(root, "code.ts"), "code\n");
    execFileSync("git", ["-C", root, "add", "code.ts"]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "code change",
    ]);
    projectGithubGates(reviewSnapshot, root, project);
    expect(reviewItem.stages.review.approved).toMatchObject({ remoteState: "stale" });
    const freshDefault = indexProject(files, {
      name: "Test",
      github: { ...github, items: [{ ...github.items[0], bound: false }] },
    });
    expect(freshDefault.workItems[0]).toMatchObject({
      workflow: "feature",
      stage: "clarify",
      stages: {},
    });
    github.items[0].detail.complete = false;
    const unavailable = indexProject(files, { name: "Test", github });
    projectGithubGates(unavailable, root, project);
    expect(unavailable.workItems[0].stages.clarify.approved).toMatchObject({
      remoteState: "unknown",
    });
    expect(unavailable.workItems[0].github?.reviewDigest).toBeUndefined();
    expect(unavailable.workItems[0].github?.reviewHead).toBeUndefined();
    for (const detail of [{ ...github.items[0].detail, complete: true, stale: true }, undefined]) {
      const result = indexProject(files, {
        name: "Test",
        github: { ...github, items: [{ ...github.items[0], detail }] },
      });
      projectGithubGates(result, root, project);
      expect(result.workItems[0].stages.clarify.approved).toMatchObject({ remoteState: "unknown" });
      expect(result.workItems[0].github?.reviewDigest).toBeUndefined();
      expect(result.workItems[0].github?.reviewHead).toBeUndefined();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("worktree workflow overrides main only when present", () => {
  const root = mkdtempSync(join(tmpdir(), "github-overlay-"));
  try {
    const path = ".stintwork/github/example/project/1/workflow.yaml";
    const files = createMemoryRepoFiles({ [path]: "main" });
    const project = {
      files,
      worktreePaths: new Map([["github-1", root]]),
      watchPaths: [],
      warnings: [],
    } as ReturnType<ProjectFilesReader>;
    const github = {
      repository: "Example/Project",
      repositoryId: "R",
      items: [
        {
          id: "I",
          number: 1,
          title: "Parent",
          url: "https://github.com/Example/Project/issues/1",
          complete: true,
        },
      ],
      scanned: 1,
      cursor: null,
      complete: true,
      pages: [],
      warnings: [],
    };
    expect(githubSnapshotFiles(project, github).read(path)).toBe("main");
    mkdirSync(join(root, ".stintwork/github/example/project/1"), { recursive: true });
    writeFileSync(join(root, path), "worktree");
    expect(githubSnapshotFiles(project, github).read(path)).toBe("worktree");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parent and ticket revisions invalidate only dependent approvals and a revert restores them", async () => {
  const ticket = {
    id: "I_2",
    number: 2,
    title: "Ticket",
    body: "Ticket",
    state: "open",
    stateReason: null,
    labels: [],
    blockers: [],
    commentRecords: [],
    comments: [],
    blockedBy: [],
    blocked: false,
  };
  const input = { parentId: "I_1", body: "Spec", tickets: [ticket] };
  const spec = await githubEvidenceDigest(input, false);
  const tickets = await githubEvidenceDigest(input, true);
  const path = ".stintwork/github/example/project/1/workflow.yaml";
  const files = createMemoryRepoFiles({
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n",
    [path]: `workflow: feature\nstage: implement\nstages:\n  clarify:\n    approved: { remote: { version: 1, parentId: I_1, digest: '${spec}' } }\n  spec:\n    approved: { remote: { version: 1, parentId: I_1, digest: '${spec}' } }\n  tickets:\n    approved: { remote: { version: 1, parentId: I_1, digest: '${tickets}' } }\n`,
  });
  const github = {
    repository: "Example/Project",
    repositoryId: "R_1",
    items: [
      {
        id: "I_1",
        number: 1,
        title: "Parent",
        url: "https://github.com/Example/Project/issues/1",
        bound: true,
        complete: true,
        detail: { spec: "Spec", tickets: [ticket], complete: true },
      },
    ],
    scanned: 1,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
  };
  const project = {
    files,
    worktreePaths: new Map(),
    watchPaths: [],
    warnings: [],
  } as ReturnType<ProjectFilesReader>;
  const states = () => {
    const snapshot = indexProject(files, { name: "Test", github });
    projectGithubGates(snapshot, process.cwd(), project);
    return ["spec", "tickets"].map(
      (stage) =>
        (snapshot.workItems[0].stages[stage].approved as { remoteState: string }).remoteState,
    );
  };
  expect(states()).toEqual(["current", "current"]);
  github.items[0].detail.spec = "Changed";
  expect(states()).toEqual(["stale", "stale"]);
  github.items[0].detail.spec = "Spec";
  ticket.body = "Changed";
  expect(states()).toEqual(["current", "stale"]);
  ticket.body = "Ticket";
  expect(states()).toEqual(["current", "current"]);
});
