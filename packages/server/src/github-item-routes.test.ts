// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { Hono } from "hono";
import { afterEach, expect, test } from "vitest";
import { createAgentRegistry } from "@stintwork/agents";
import { createFakeAgentLauncher, fakeAgentProfiles } from "@stintwork/agents/testing";
import { indexProject } from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import { fakeGh } from "../test/fake-gh.js";
import { createProjectFiles } from "./work-item-files.js";
import { githubSnapshotFiles } from "./github-snapshot.js";
import { validateGithubIdentities, type GithubDiscovery } from "./github-discovery.js";
import { addMemoryProposalRoutes } from "./memory-proposals.js";
import { addStageAgentRoute } from "./stage-agent.js";
import { addWorkItemDiffRoute } from "./work-item-diff.js";
import { addCheckRoutes, createChecks } from "./checks.js";
import { addFindingDecisionRoutes } from "./finding-decisions.js";
import { addRoadmapRoute } from "./roadmap.js";
import { addGateRoutes } from "./gates.js";

const roots: string[] = [];
const oldPath = process.env.PATH;
afterEach(() => {
  process.env.PATH = oldPath;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const workflowPath = ".stintwork/github/example/project/1/workflow.yaml";
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "github-item-routes-"));
  roots.push(root, `${root}-worktrees`);
  const git = (dir: string, ...args: string[]) =>
    execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  for (const [path, text] of Object.entries({
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n",
    ".gitignore": ".stintwork/local/\nbin/\n",
    "GLOSSARY.md": "Original\n",
    ".stintwork/roadmap.md": "# Roadmap\n\n## First\nId: first\nStatus: active\n",
    [workflowPath]:
      "workflow: feature\nstage: review\ngithub:\n  host: github.com\n  repositoryId: R_1\n  repository: Example/Project\n  issueId: I_1\n  number: 1\n  url: https://github.com/Example/Project/issues/1\n",
  })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  git(root, "add", ".");
  git(root, "commit", "-qm", "initial");
  const worktree = (await ensureWorktree(root, "github-1")).path;
  const gh = await fakeGh(join(root, "bin"));
  process.env.PATH = gh.path;
  await gh.script({});
  const github: GithubDiscovery = {
    repository: "Example/Project",
    repositoryId: "R_1",
    items: [
      {
        id: "I_1",
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
  const project = createProjectFiles(root);
  const refresh = () => {
    Object.assign(github, validateGithubIdentities(project().files, github));
  };
  refresh();
  const getSnapshot = () =>
    indexProject(githubSnapshotFiles(project(), github), { name: "test", github });
  const app = new Hono();
  const registry = createAgentRegistry([
    { ...fakeAgentProfiles.codex, launch: createFakeAgentLauncher([]) },
  ]);
  const writing = new Set<string>();
  addMemoryProposalRoutes(app, root, project, refresh, () => false, writing, getSnapshot);
  addStageAgentRoute(
    app,
    project,
    root,
    registry,
    refresh,
    () => false,
    writing,
    getSnapshot,
    () => github,
  );
  addWorkItemDiffRoute(app, root, project, getSnapshot);
  const checks = createChecks(root, () => {}, refresh);
  addCheckRoutes(app, checks, project, () => false, getSnapshot);
  addFindingDecisionRoutes(
    app,
    project,
    refresh,
    () => false,
    writing,
    () => false,
    undefined,
    getSnapshot,
    () => github,
  );
  addRoadmapRoute(app, root, project, refresh, getSnapshot);
  addGateRoutes(app, project, root, refresh, () => false, writing, undefined, getSnapshot);
  const post = (url: string, body: unknown) =>
    app.request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { root, worktree, git, app, post, getSnapshot };
}

test.each(["accepted", "rejected"] as const)("memory proposal can be %s", async (status) => {
  const { root, worktree, git, post } = await fixture();
  const base = git(worktree, "rev-parse", "HEAD");
  writeFileSync(join(worktree, "GLOSSARY.md"), "Proposed\n");
  git(worktree, "add", "GLOSSARY.md");
  git(worktree, "commit", "-qm", "proposal");
  const checkpoint = git(worktree, "rev-parse", "HEAD");
  const log = join(root, ".stintwork/local/stints/s1.jsonl");
  mkdirSync(dirname(log), { recursive: true });
  writeFileSync(
    log,
    [
      {
        type: "started",
        at: "2026-01-01T00:00:00Z",
        stint: {
          id: "s1",
          workItem: "github-1",
          stage: "review",
          ticket: null,
          agent: "codex",
          worktree: { path: worktree, branch: "stintwork/github-1" },
          baseCommit: base,
          brief: { prompt: "", skill: null, lastHandoff: null, changedPaths: [], pointers: [] },
        },
      },
      {
        type: "ended",
        at: "2026-01-01T00:01:00Z",
        status: "finished",
        checkpointCommit: checkpoint,
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n",
  );
  const response = await post("/api/work-items/github-1/memory-proposals/decision", {
    id: `memory-proposal:${JSON.stringify(["s1", "GLOSSARY.md"])}`,
    status,
  });
  expect(response.status, await response.text()).toBe(200);
  expect(readFileSync(join(worktree, "GLOSSARY.md"), "utf8")).toBe(
    status === "rejected" ? "Original\n" : "Proposed\n",
  );
});

test("GitHub item routes resolve the discovered item and persist its stage agent", async () => {
  const { app, post, worktree } = await fixture();
  let response = await post("/api/work-items/github-1/stages/review/agent", { agent: "codex" });
  expect(response.status, await response.text()).toBe(200);
  expect(readFileSync(join(worktree, workflowPath), "utf8")).toContain("agent: codex");
  response = await app.request("/api/work-items/github-1/diff");
  expect(response.status, await response.text()).toBe(200);
  response = await post("/api/work-items/github-1/checks", {});
  expect(response.status).not.toBe(404);
  response = await post("/api/work-items/github-1/findings/decision", {
    id: "missing",
    status: "resolved",
  });
  expect(response.status).toBe(404);
  expect((await response.json()).reasonMessage.code).toBe("review.findingNotFound");
  response = await post("/api/roadmap", { kind: "move", workItem: "github-1", milestone: "first" });
  expect(response.status, await response.text()).toBe(200);
  response = await post("/api/work-items/github-1/gates/review/approve", {});
  expect(response.status).toBe(409);
  expect((await response.json()).reason).toContain("/api/github/items/");
});

test("a finding at Review can be decided and sent back using the GitHub workflow", async () => {
  const { root, worktree, git, post } = await fixture();
  const head = git(worktree, "rev-parse", "HEAD");
  const log = join(root, ".stintwork/local/stints/review.jsonl");
  mkdirSync(dirname(log), { recursive: true });
  writeFileSync(
    log,
    [
      {
        type: "started",
        at: "2026-01-01T00:00:00Z",
        stint: {
          id: "review",
          workItem: "github-1",
          stage: "review",
          ticket: null,
          agent: "codex",
          worktree: { path: worktree, branch: "stintwork/github-1" },
          baseCommit: head,
          brief: { prompt: "", skill: null, lastHandoff: null, changedPaths: [], pointers: [] },
        },
      },
      {
        type: "ended",
        at: "2026-01-01T00:01:00Z",
        status: "finished",
        checkpointCommit: head,
        findings: {
          commit: head,
          findings: [
            {
              id: "finding-1",
              axis: "Spec",
              severity: "major",
              path: "src/file.ts",
              line: 1,
              title: "Missing limit",
              body: "Add a limit.",
            },
            {
              id: "finding-2",
              axis: "Spec",
              severity: "minor",
              path: "src/file.ts",
              line: 2,
              title: "Other",
              body: "Fix it.",
            },
          ],
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n",
  );
  const decision = await post("/api/work-items/github-1/findings/decision", {
    id: "finding-2",
    status: "resolved",
  });
  expect(decision.status, await decision.text()).toBe(200);
  const response = await post("/api/work-items/github-1/findings/send-back", {});
  expect(response.status, await response.text()).toBe(200);
  expect(readFileSync(join(worktree, workflowPath), "utf8")).toContain("stage: implement");
  expect(readFileSync(join(worktree, ".scratch/github-1/review.yaml"), "utf8")).toContain(
    "finding-1",
  );
  expect(git(worktree, "show", "--format=", "--name-only", "HEAD")).toContain(workflowPath);
});
