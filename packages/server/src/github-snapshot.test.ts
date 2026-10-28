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
