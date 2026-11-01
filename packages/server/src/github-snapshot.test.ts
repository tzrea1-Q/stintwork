// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMemoryRepoFiles,
  builtInWorkflows,
  deriveAttentionItems,
  githubEvidenceDigest,
  githubEvidenceDigestV2,
  indexProject,
} from "@stintwork/core";
import { expect, test } from "vitest";
import { githubSnapshotFiles, projectGithubGates } from "./github-snapshot.js";
import type { ProjectFilesReader } from "./work-item-files.js";
import { createReviewEvidenceReader } from "./review-evidence.js";
import type { createChecks } from "./checks.js";
import { githubGateIncludesTickets } from "./github-evidence-scope.js";

test("built-in workflows retain their previous evidence digests", async () => {
  const input = {
    parentId: "I_1",
    body: "Spec",
    tickets: [
      {
        id: "I_2",
        body: "Ticket",
        state: "open",
        stateReason: null,
        labels: [],
        blockers: [],
        commentRecords: [],
      },
    ],
  };
  for (const workflow of Object.values(builtInWorkflows)) {
    const stages = workflow.stages;
    for (const [index, stage] of stages.entries()) {
      const previous = index > stages.findIndex((entry) => entry.column === "spec");
      expect(await githubEvidenceDigest(input, githubGateIncludesTickets(stages, stage.id))).toBe(
        await githubEvidenceDigest(input, previous),
      );
    }
  }
});

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
    const emptyWorktree = join(root, "empty-worktree");
    execFileSync("git", ["-C", root, "worktree", "add", "-qb", "empty", emptyWorktree]);
    execFileSync("git", [
      "-C",
      emptyWorktree,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--allow-empty",
      "-qm",
      "worktree head",
    ]);
    const worktreeHead = execFileSync("git", ["-C", emptyWorktree, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const emptyFiles = createMemoryRepoFiles({
      "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n",
    });
    const unbound = indexProject(emptyFiles, {
      name: "Test",
      github: { ...github, items: [{ ...github.items[0], bound: false }] },
    });
    projectGithubGates(unbound, root, {
      ...project,
      files: emptyFiles,
      worktreePaths: new Map([["github-1", emptyWorktree]]),
    });
    expect(unbound.workItems[0].github?.reviewHead).toBe(worktreeHead);
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
        reviewDigest: await githubEvidenceDigestV2(
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
      code: "github-workflow-divergence",
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
    reviewItem.stages.spec = {
      approved: { ...approval, at: "2026-01-03T00:00:00Z", remote: { ...approval.remote, digest } },
      reopened: { at: "2026-01-02T00:00:00Z" },
    };
    reviewItem.stages.tickets = { approved: approval };
    projectGithubGates(reviewSnapshot, root, project);
    expect(reviewItem.stages.spec.approved).toMatchObject({ remoteState: "current" });
    expect(reviewItem.stages.tickets.approved).toMatchObject({ remoteState: "stale" });
    reviewItem.stages.tickets.approved = { ...approval, at: "2026-01-04T00:00:00Z" };
    projectGithubGates(reviewSnapshot, root, project);
    expect(reviewItem.stages.tickets.approved).toMatchObject({ remoteState: "current" });
    reviewItem.stages.tickets.approved = {
      ...approval,
      remote: { ...approval.remote, digest: "changed" },
    };
    projectGithubGates(reviewSnapshot, root, project);
    expect(reviewItem.stages.tickets.approved).toMatchObject({ remoteState: "stale" });
    reviewItem.stages.tickets.approved = {
      ...approval,
      remote: { ...approval.remote, version: 99 },
    };
    projectGithubGates(reviewSnapshot, root, project);
    expect(reviewItem.stages.tickets.approved).toMatchObject({ remoteState: "unknown" });
    delete reviewItem.stages.spec.reopened;
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

test("attention is derived after GitHub projection while local attention is unchanged", async () => {
  const files = createMemoryRepoFiles({
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n",
  });
  const github = {
    repository: "Example/Project",
    repositoryId: "R",
    scanned: 1,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
    items: [
      {
        id: "I",
        number: 1,
        title: "Parent",
        url: "https://github.com/Example/Project/issues/1",
        bound: true,
        complete: true,
        detail: { spec: "Spec", tickets: [], complete: true },
      },
    ],
  };
  const project = {
    files,
    worktreePaths: new Map(),
    watchPaths: [],
    warnings: [],
  } as ReturnType<ProjectFilesReader>;
  const snapshot = indexProject(files, { name: "Test", github });
  const item = snapshot.workItems[0];
  item.stints = [
    {
      id: "s",
      workItem: item.slug,
      stage: "clarify",
      ticket: null,
      agent: "codex",
      status: "finished",
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
      checkpointCommit: null,
      handoff: {
        stint: "s",
        agent: "codex",
        stoppedAt: "Done",
        unresolved: "None",
        nextStep: "Approve",
      },
    },
  ];
  snapshot.attentionItems = deriveAttentionItems(snapshot);
  expect(snapshot.attentionItems.filter((entry) => entry.kind === "gate-ready")).toEqual([]);
  const checks = { evidence: () => ({}), commands: () => [] } as unknown as ReturnType<
    typeof createChecks
  >;
  const readEvidence = createReviewEvidenceReader(process.cwd(), checks);
  projectGithubGates(snapshot, process.cwd(), project);
  readEvidence(project, snapshot);
  expect(snapshot.attentionItems).toContainEqual(
    expect.objectContaining({ kind: "gate-ready", workItem: item.slug }),
  );
  if (!item.github) throw new Error("Missing GitHub metadata");
  item.stage = "spec";
  item.stages.clarify = { approved: { remoteState: "stale" } };
  item.stints[0].stage = "spec";
  readEvidence(project, snapshot);
  expect(snapshot.attentionItems.filter((entry) => entry.kind === "gate-ready")).toEqual([]);
  item.stage = "clarify";
  item.stints[0].stage = "clarify";
  item.github.stale = true;
  readEvidence(project, snapshot);
  expect(snapshot.attentionItems.filter((entry) => entry.kind === "gate-ready")).toEqual([]);
  item.github.stale = false;
  item.stints[0].status = "interrupted";
  readEvidence(project, snapshot);
  expect(snapshot.attentionItems.filter((entry) => entry.kind === "gate-ready")).toEqual([]);

  const localFiles = createMemoryRepoFiles({ ".scratch/local/spec.md": "# Spec" });
  const local = indexProject(localFiles, { name: "Local" });
  local.workItems[0].stints = [
    { ...item.stints[0], workItem: "local", stage: "spec", status: "finished" },
  ];
  local.attentionItems = deriveAttentionItems(local);
  const before = local.attentionItems;
  const localProject = { ...project, files: localFiles };
  projectGithubGates(local, process.cwd(), localProject);
  readEvidence(localProject, local);
  expect(local.attentionItems).toEqual(before);
  expect(before).toContainEqual(expect.objectContaining({ kind: "gate-ready", workItem: "local" }));
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
          bound: true,
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
    github.items[0].bound = false;
    expect(githubSnapshotFiles(project, github).read(path)).toBe("main");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.each([false, true])(
  "parent and ticket revisions invalidate dependent approvals (custom: %s)",
  async (custom) => {
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
      [path]: `workflow: feature\nstage: implement\nstages:\n  clarify:\n    approved: { remote: { version: 1, parentId: I_1, digest: '${spec}' } }\n  spec:\n    approved: { remote: { version: 1, parentId: I_1, digest: '${custom ? tickets : spec}' } }\n  tickets:\n    approved: { remote: { version: 1, parentId: I_1, digest: '${tickets}' } }\n`,
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
      if (custom) {
        snapshot.workflows.feature = {
          ...snapshot.workflows.feature,
          stages: snapshot.workflows.feature.stages.map((entry) => ({
            ...entry,
            gate: entry.id === "spec" ? "tickets" : entry.id === "tickets" ? "manual" : entry.gate,
          })),
        };
      }
      projectGithubGates(snapshot, process.cwd(), project);
      return ["clarify", "spec", "tickets"].map(
        (stage) =>
          (snapshot.workItems[0].stages[stage].approved as { remoteState: string }).remoteState,
      );
    };
    expect(states()).toEqual(["current", "current", "current"]);
    github.items[0].detail.spec = "Changed";
    expect(states()).toEqual(["stale", "stale", "stale"]);
    github.items[0].detail.spec = "Spec";
    ticket.body = "Changed";
    expect(states()).toEqual(["current", custom ? "stale" : "current", "stale"]);
    ticket.body = "Ticket";
    expect(states()).toEqual(["current", "current", "current"]);
  },
);

test("a GitHub approval introduced in the root commit stays unknown", async () => {
  const root = mkdtempSync(join(tmpdir(), "github-root-approval-"));
  try {
    execFileSync("git", ["init", "-q", root]);
    const digest = await githubEvidenceDigest(
      { parentId: "I_1", body: "Spec", tickets: [] },
      false,
    );
    const path = ".stintwork/github/example/project/1/workflow.yaml";
    const workflow = `workflow: feature\nstage: spec\nstages:\n  clarify:\n    approved:\n      by: Test\n      at: '2026-01-01T00:00:00Z'\n      commit: reviewed\n      remote: { version: 1, parentId: I_1, digest: '${digest}' }\n`;
    mkdirSync(join(root, ".stintwork/github/example/project/1"), { recursive: true });
    writeFileSync(join(root, path), workflow);
    execFileSync("git", ["-C", root, "add", path]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "root approval",
    ]);
    const files = createMemoryRepoFiles({
      "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n",
      [path]: workflow,
    });
    const github = {
      repository: "Example/Project",
      repositoryId: "R_1",
      scanned: 1,
      cursor: null,
      complete: true,
      pages: [],
      warnings: [],
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
    };
    const project = {
      files,
      worktreePaths: new Map(),
      watchPaths: [],
      warnings: [],
    } as ReturnType<ProjectFilesReader>;
    const snapshot = indexProject(files, { name: "Test", github });
    projectGithubGates(snapshot, root, project);
    expect(snapshot.workItems[0].stages.clarify.approved).toMatchObject({ remoteState: "unknown" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
