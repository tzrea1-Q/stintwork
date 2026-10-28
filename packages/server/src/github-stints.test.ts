// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, expect, test } from "vitest";
import { createAgentRegistry } from "@stintwork/agents";
import { githubEvidenceDigest, indexProject } from "@stintwork/core";
import { fakeGh, type GhReply } from "../test/fake-gh.js";
import { addBriefPreviewRoute, type GithubBriefSource } from "./brief-preview.js";
import { addStintRoutes } from "./stints.js";
import { createNodeRepoFiles } from "./repo-files.js";
import { createProjectFiles } from "./work-item-files.js";
import { githubSnapshotFiles } from "./github-snapshot.js";
import { validateGithubIdentities, type GithubDiscovery } from "./github-discovery.js";
import { addGithubGateRoutes, verifyGithubGateIdentity } from "./github-gates.js";
import { stringify } from "yaml";

const roots: string[] = [];
const oldPath = process.env.PATH;
afterEach(() => {
  process.env.PATH = oldPath;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const issue = "api repos/Example/Project/issues/1";
const childPath = "api repos/Example/Project/issues/2";
const parent = {
  node_id: "I_1",
  number: 1,
  title: "Parent",
  body: "Spec",
  html_url: "https://github.com/Example/Project/issues/1",
  repository_url: "https://api.github.com/repos/Example/Project",
  state: "open",
  state_reason: null,
  labels: [],
  comments: 0,
  sub_issues_summary: { total: 1 },
};
const child = {
  ...parent,
  node_id: "I_2",
  number: 2,
  title: "Ticket",
  body: "Ticket body",
  html_url: "https://github.com/Example/Project/issues/2",
  sub_issues_summary: { total: 0 },
  issue_dependencies_summary: { total_blocked_by: 0 },
};
const path = ".stintwork/github/example/project/1/workflow.yaml";
async function setup(
  replies: Record<string, GhReply | GhReply[]> = {},
  stage = "clarify",
  record = false,
) {
  const root = mkdtempSync(join(tmpdir(), "github-stints-"));
  roots.push(root, `${root}-worktrees`);
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("remote", "add", "origin", "https://github.com/Example/Project.git");
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  writeFileSync(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
  if (record) {
    const spec = await githubEvidenceDigest({ parentId: "I_1", body: "Spec", tickets: [] }, false);
    const tickets = await githubEvidenceDigest(
      {
        parentId: "I_1",
        body: "Spec",
        tickets: [
          {
            id: "I_2",
            body: "Ticket body",
            state: "open",
            stateReason: null,
            labels: [],
            blockers: [],
            commentRecords: [],
          },
        ],
      },
      true,
    );
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(
      join(root, path),
      stringify({
        workflow: "feature",
        stage,
        github: {
          host: "github.com",
          repositoryId: "R_1",
          repository: "Example/Project",
          issueId: "I_1",
          number: 1,
          url: parent.html_url,
        },
        stages: {
          spec: {
            approved: { at: "2026-01-01", remote: { version: 1, parentId: "I_1", digest: spec } },
          },
          tickets: {
            approved: {
              at: "2026-01-01",
              remote: { version: 1, parentId: "I_1", digest: tickets },
            },
          },
        },
      }),
    );
  }
  git("add", ".");
  git("commit", "-qm", "initial");
  const gh = await fakeGh(join(root, "bin"));
  process.env.PATH = gh.path;
  await gh.script({
    "auth status": {},
    "api user": { stdout: "101" },
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_1",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    [issue]: { stdout: parent },
    [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [child] },
    [`${issue}/comments?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
    ...replies,
  });
  const github: GithubDiscovery = {
    repository: "Example/Project",
    repositoryId: "R_1",
    items: [{ id: "I_1", number: 1, title: "Parent", url: parent.html_url, complete: true }],
    scanned: 1,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
  };
  const project = createProjectFiles(root, createNodeRepoFiles(root));
  let snapshot = indexProject(project().files, { name: "test", github });
  let failures = 0;
  const source: GithubBriefSource = {
    getGithub: () => github,
    getSnapshot: () => snapshot,
    verifyIdentity: (expected) =>
      verifyGithubGateIdentity(root, expected, { viewer: "101", origin: "Example/Project" }),
    detailFailed: () => {
      failures++;
    },
    refresh: () => {
      const p = project();
      try {
        const worktree = p.worktreePaths.get("github-1");
        const worktreeFiles = worktree ? createNodeRepoFiles(worktree) : undefined;
        const sourceFiles = worktreeFiles?.read(path) !== undefined ? worktreeFiles : p.files;
        const validated = validateGithubIdentities(sourceFiles, github);
        Object.assign(github, validated);
        snapshot = indexProject(githubSnapshotFiles(p, github), { name: "test", github });
      } catch {
        snapshot.github = { ...github, errorCode: "identity" };
      }
    },
  };
  source.refresh();
  const app = new Hono();
  const registry = createAgentRegistry();
  addBriefPreviewRoute(app, project, root, registry, () => source.refresh(), source);
  let finish: () => void = () => {};
  const stints = addStintRoutes(
    app,
    root,
    project,
    {
      agentRegistry: registry,
      launchAgent: () => ({
        done: new Promise((resolve) => {
          finish = () => resolve({ stopReason: "end_turn" });
        }),
        cancel: async () => {},
      }),
    },
    () => {},
    () => source.refresh(),
    undefined,
    undefined,
    undefined,
    source,
  );
  const preview = () => app.request("/api/work-items/github-1/tickets/2/brief-preview");
  const start = () =>
    app.request("/api/stints", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workItem: "github-1", ticket: 2, agent: "codex" }),
    });
  addGithubGateRoutes(
    app,
    root,
    () => github,
    () => snapshot,
    project,
    source.refresh,
    stints.isActive,
    stints.workflowWrites,
    source.verifyIdentity,
    source.detailFailed,
  );
  const gate = () =>
    app.request("/api/github/items/1/gates/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "clarify", reviewedDigest: "x", reviewedHead: "x" }),
    });
  return {
    root,
    git,
    preview,
    start,
    stints,
    github,
    gate,
    source,
    failures: () => failures,
    finish: () => finish(),
  };
}

test("preview refreshes GitHub detail without writing a record or worktree", async () => {
  const { preview, root } = await setup();
  const response = await preview();
  expect(response.status).toBe(200);
  expect((await response.json()).prompt).toContain("https://github.com/Example/Project/issues/2");
  expect(existsSync(join(root, path))).toBe(false);
  expect(existsSync(`${root}-worktrees/github-1`)).toBe(false);
});

test("first start commits identity in its worktree and concurrent start refuses", async () => {
  const { start, root, git } = await setup();
  const response = await start();
  expect(response.status, await response.clone().text()).toBe(201);
  const worktree = `${root}-worktrees/github-1`;
  expect(existsSync(worktree)).toBe(true);
  expect(readFileSync(join(worktree, path), "utf8")).toContain("repositoryId: R_1");
  expect(git("show", `stintwork/github-1:${path}`)).toContain("issueId: I_1");
  expect((await start()).status).toBe(409);
});

test.each([
  ["failed detail", { [issue]: { code: 1 } }],
  ["incomplete detail", { [issue]: { stdout: { ...parent, sub_issues_summary: { total: 2 } } } }],
  ["viewer changed", { "api user": { stdout: "102" } }],
  [
    "repository changed",
    {
      "api repos/Example/Project": {
        stdout: {
          node_id: "R_other",
          full_name: "Example/Project",
          html_url: "https://github.com/Example/Project",
        },
      },
    },
  ],
  [
    "resolved",
    {
      [`${issue}/sub_issues?per_page=100&page=1`]: {
        stdout: [{ ...child, state: "closed", state_reason: "completed" }],
      },
    },
  ],
  [
    "unknown state",
    {
      [`${issue}/sub_issues?per_page=100&page=1`]: {
        stdout: [{ ...child, state: "closed", state_reason: null }],
      },
    },
  ],
  [
    "cancelled",
    {
      [`${issue}/sub_issues?per_page=100&page=1`]: {
        stdout: [{ ...child, state: "closed", state_reason: "not_planned" }],
      },
    },
  ],
  [
    "unknown dependency",
    {
      [`${issue}/sub_issues?per_page=100&page=1`]: {
        stdout: [{ ...child, body: "Blocked by: unclear" }],
      },
    },
  ],
] as const)("refuses %s without creating a stint or branch", async (_name, replies) => {
  const { start, root, git } = await setup(replies, "implement", true);
  const response = await start();
  expect(response.status).toBe(409);
  expect(existsSync(`${root}-worktrees/github-1`)).toBe(false);
  expect(git("branch", "--list", "stintwork/github-1")).toBe("");
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});

test("stale tickets approval refuses and current approval starts", async () => {
  const stale = await setup(
    { [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [{ ...child, body: "Changed" }] } },
    "implement",
    true,
  );
  expect((await stale.start()).status).toBe(409);
  const current = await setup({}, "implement", true);
  const response = await current.start();
  expect(response.status, await response.clone().text()).toBe(201);
});

test("gate writes and starts exclude each other", async () => {
  const { start, stints, gate } = await setup();
  stints.workflowWrites.add("github-1");
  expect((await start()).status).toBe(409);
  stints.workflowWrites.delete("github-1");
  expect((await start()).status).toBe(201);
  const response = await gate();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ reasonMessage: { code: "gate.activeWrite" } });
});

test("a mismatched record refuses before worktree creation", async () => {
  const { root, git, start } = await setup({}, "implement", true);
  const contents = readFileSync(join(root, path), "utf8").replace(
    "issueId: I_1",
    "issueId: I_other",
  );
  writeFileSync(join(root, path), contents);
  git("add", path);
  git("commit", "-qm", "mismatch");
  expect((await start()).status).toBe(409);
  expect(existsSync(`${root}-worktrees/github-1`)).toBe(false);
  expect(git("branch", "--list", "stintwork/github-1")).toBe("");
});

test("an open blocker refuses a ticket stint", async () => {
  const blocker = {
    ...child,
    node_id: "I_3",
    number: 3,
    html_url: "https://github.com/Example/Project/issues/3",
  };
  const fixture = await setup(
    {
      [`${issue}/sub_issues?per_page=100&page=1`]: {
        stdout: [{ ...child, issue_dependencies_summary: { total_blocked_by: 1 } }],
      },
      [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [blocker] },
    },
    "implement",
    true,
  );
  expect((await fixture.start()).status).toBe(409);
  expect(existsSync(`${fixture.root}-worktrees/github-1`)).toBe(false);
});

test("a later stint reuses the committed workflow record", async () => {
  const { start, finish, stints, root, git } = await setup();
  expect((await start()).status).toBe(201);
  finish();
  await expect.poll(() => stints.isActive("github-1"), { timeout: 10000 }).toBe(false);
  const worktree = `${root}-worktrees/github-1`;
  const before = execFileSync("git", ["-C", worktree, "log", "--format=%H", "--", path], {
    encoding: "utf8",
  }).trim();
  const response = await start();
  expect(response.status, await response.clone().text()).toBe(201);
  const after = execFileSync("git", ["-C", worktree, "log", "--format=%H", "--", path], {
    encoding: "utf8",
  }).trim();
  expect(after).toBe(before);
  expect(git("branch", "--list", "stintwork/github-1")).toContain("stintwork/github-1");
});

test("failed detail invokes the shared failure handler", async () => {
  const fixture = await setup({ [issue]: { code: 1 } });
  const response = await fixture.preview();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    reasonMessage: { code: "gate.detailUnavailable" },
  });
  expect(fixture.failures()).toBe(1);
});
