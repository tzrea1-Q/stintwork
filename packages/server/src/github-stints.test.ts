// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, expect, test } from "vitest";
import { createAgentRegistry } from "@stintwork/agents";
import { githubEvidenceDigest, indexProject } from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import { fakeGh, type GhReply } from "../test/fake-gh.js";
import { addBriefPreviewRoute, type GithubBriefSource } from "./brief-preview.js";
import { addStintRoutes } from "./stints.js";
import { createNodeRepoFiles } from "./repo-files.js";
import { createProjectFiles } from "./work-item-files.js";
import { githubSnapshotFiles } from "./github-snapshot.js";
import { validateGithubIdentities, type GithubDiscovery } from "./github-discovery.js";
import { addGithubGateRoutes, verifyGithubGateIdentity } from "./github-gates.js";
import { parse, stringify } from "yaml";

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
  approvedTicket: Omit<typeof child, "state_reason"> & { state_reason: string | null } = child,
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
            state: approvedTicket.state,
            stateReason: approvedTicket.state_reason,
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
          clarify: {
            approved: { at: "2026-01-01", remote: { version: 1, parentId: "I_1", digest: spec } },
          },
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
  const ghReplies = {
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
  };
  await gh.script(ghReplies);
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
    discoveryFailed: () => false,
    registerDetailIdentities: () => {},
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
    gh,
    ghReplies,
  };
}

test("failed discovery blocks preview and start until discovery recovers", async () => {
  const { root, git, gh, ghReplies } = await setup();
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web/index.html"), "<!doctype html>");
  const page = JSON.parse(
    readFileSync(new URL("../test/fixtures/github-discovery/issues.json", import.meta.url), "utf8"),
  );
  const item = page.data.repository.issues.nodes[0];
  Object.assign(item, {
    id: "I_1",
    number: 1,
    title: "Parent",
    url: parent.html_url,
    parent: null,
    labels: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    subIssues: {
      nodes: [{ repository: { id: "R_1" }, subIssues: { totalCount: 0 } }],
      totalCount: 1,
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  });
  page.data.repository.id = "R_1";
  page.data.repository.nameWithOwner = "Example/Project";
  page.data.repository.issues.nodes = [item];
  page.data.repository.issues.pageInfo = { hasNextPage: false, endCursor: null };
  const replies = { ...ghReplies, "api graphql": { stdout: page } };
  await gh.script(replies);
  const { createProjectServer } = await import("./index.js");
  const server = createProjectServer(root, join(root, "web"), {
    launchAgent: () => {
      let finish: () => void = () => {};
      const done = new Promise<{ stopReason: "end_turn" }>((resolve) => {
        finish = () => resolve({ stopReason: "end_turn" });
      });
      return { done, cancel: async () => finish() };
    },
  });
  try {
    const initial = await (await server.app.request("/api/project")).json();
    expect(initial.github.items).toHaveLength(1);
    await gh.script({
      ...replies,
      "api graphql": { code: 1, effect: "process.stderr.write('network is unreachable')" },
    });
    const failed = await (
      await server.app.request("/api/github/discovery/refresh", { method: "POST" })
    ).json();
    expect(failed.github).toMatchObject({ stale: true, errorCode: "offline" });
    const preview = () => server.app.request("/api/work-items/github-1/tickets/2/brief-preview");
    const start = () =>
      server.app.request("/api/stints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workItem: "github-1", ticket: 2, agent: "codex" }),
      });
    for (const response of [await preview(), await start()]) {
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        reasonMessage: { code: "gate.detailUnavailable" },
      });
    }
    expect(existsSync(join(root, path))).toBe(false);
    expect(existsSync(join(root, ".stintwork/local/stints"))).toBe(false);
    expect(existsSync(`${root}-worktrees/github-1`)).toBe(false);
    expect(git("branch", "--list", "stintwork/github-1")).toBe("");
    await gh.script(replies);
    await server.app.request("/api/github/discovery/refresh", { method: "POST" });
    const response = await start();
    expect(response.status, await response.clone().text()).toBe(201);
  } finally {
    await server.stop();
  }
});

test.each([
  ["ticket", "preview"],
  ["ticket", "start"],
  ["blocker", "preview"],
  ["blocker", "start"],
  ["unchanged", "preview"],
] as const)(
  "observed %s identities are checked during preview and start (%s first)",
  async (scenario, first) => {
    const { root, git, gh, ghReplies } = await setup();
    mkdirSync(join(root, "web"));
    writeFileSync(join(root, "web/index.html"), "<!doctype html>");
    const page = JSON.parse(
      readFileSync(
        new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
        "utf8",
      ),
    );
    const item = page.data.repository.issues.nodes[0];
    Object.assign(item, {
      id: "I_1",
      number: 1,
      title: "Parent",
      url: parent.html_url,
      parent: null,
      labels: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      subIssues: {
        nodes: [{ repository: { id: "R_1" }, subIssues: { totalCount: 0 } }],
        totalCount: 1,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    page.data.repository.id = "R_1";
    page.data.repository.nameWithOwner = "Example/Project";
    page.data.repository.issues.nodes = [item];
    page.data.repository.issues.pageInfo = { hasNextPage: false, endCursor: null };
    const blocker = {
      ...child,
      node_id: "I_3",
      number: 3,
      html_url: "https://github.com/Example/Project/issues/3",
      state: "closed",
      state_reason: "completed",
    };
    const ticket = { ...child, issue_dependencies_summary: { total_blocked_by: 1 } };
    const replies = {
      ...ghReplies,
      "api graphql": { stdout: page },
      [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [ticket] },
      [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [blocker] },
    };
    await gh.script(replies);
    const { createProjectServer } = await import("./index.js");
    const server = createProjectServer(root, join(root, "web"), {
      launchAgent: () => {
        let finish: () => void = () => {};
        const done = new Promise<{ stopReason: "end_turn" }>((resolve) => {
          finish = () => resolve({ stopReason: "end_turn" });
        });
        return { done, cancel: async () => finish() };
      },
    });
    try {
      expect(
        (await server.app.request("/api/github/items/1/refresh", { method: "POST" })).status,
      ).toBe(200);
      if (scenario === "ticket") ticket.node_id = "I_changed";
      if (scenario === "blocker") blocker.node_id = "I_changed";
      await gh.script(replies);
      const preview = () => server.app.request("/api/work-items/github-1/tickets/2/brief-preview");
      const start = () =>
        server.app.request("/api/stints", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workItem: "github-1", ticket: 2, agent: "codex" }),
        });
      if (scenario === "unchanged") {
        expect((await preview()).status).toBe(200);
        const response = await start();
        expect(response.status, await response.clone().text()).toBe(201);
      } else {
        const actions = first === "preview" ? [preview, start] : [start, preview];
        for (const action of actions) {
          const response = await action();
          expect(response.status).toBe(409);
          expect(await response.json()).toMatchObject({
            reasonMessage: { code: "gate.identityAmbiguous" },
          });
        }
        const snapshot = await (await server.app.request("/api/project")).json();
        expect(snapshot.github).toMatchObject({ stale: true, errorCode: "identity" });
        expect(snapshot.github.items[0].detail).toBeUndefined();
        expect(existsSync(join(root, path))).toBe(false);
        expect(existsSync(join(root, ".stintwork/local/stints"))).toBe(false);
        expect(existsSync(`${root}-worktrees/github-1`)).toBe(false);
        expect(git("branch", "--list", "stintwork/github-1")).toBe("");
      }
    } finally {
      await server.stop();
    }
  },
);

test("preview refreshes GitHub detail without writing a record or worktree", async () => {
  const { preview, root } = await setup();
  const response = await preview();
  expect(response.status).toBe(200);
  const { prompt } = await response.json();
  expect(prompt).toContain("https://github.com/Example/Project/issues/2");
  expect(prompt).toContain(
    `- Work in the worktree at ${realpathSync(root)}-worktrees/github-1 on branch stintwork/github-1.`,
  );
  expect(existsSync(join(root, path))).toBe(false);
  expect(existsSync(`${root}-worktrees/github-1`)).toBe(false);
});

test("preview includes the existing worktree path", async () => {
  const { preview, root } = await setup();
  const worktree = await ensureWorktree(root, "github-1");
  const response = await preview();
  expect(response.status).toBe(200);
  expect((await response.json()).prompt).toContain(
    `- Work in the worktree at ${worktree.path} on branch stintwork/github-1.`,
  );
});

test("item marked incomplete by discovery refuses preview and start", async () => {
  const { github, preview, start, root, git } = await setup();
  github.items[0].discoveryComplete = false;
  for (const response of [await preview(), await start()]) {
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reasonMessage: { code: "gate.detailUnavailable" },
    });
  }
  expect(existsSync(join(root, path))).toBe(false);
  expect(existsSync(join(root, ".stintwork/local/stints"))).toBe(false);
  expect(existsSync(`${root}-worktrees/github-1`)).toBe(false);
  expect(git("branch", "--list", "stintwork/github-1")).toBe("");
});

test("unscanned discovery pages do not block a complete item", async () => {
  const { github, preview, start } = await setup();
  github.complete = false;
  github.cursor = "next-page";
  expect((await preview()).status).toBe(200);
  const response = await start();
  expect(response.status, await response.clone().text()).toBe(201);
});

test("another item's failed detail does not block start", async () => {
  const { github, start } = await setup();
  github.items.push({
    id: "I_3",
    number: 3,
    title: "Other",
    url: "https://github.com/Example/Project/issues/3",
    complete: false,
  });
  github.stale = true;
  github.errorCode = "offline";
  const response = await start();
  expect(response.status, await response.clone().text()).toBe(201);
});

test.each(["identity", "missing repository ID"])(
  "%s refuses preview and start with identity reason",
  async (state) => {
    const { github, preview, start } = await setup();
    if (state === "identity") github.errorCode = "identity";
    else github.repositoryId = "";
    for (const response of [await preview(), await start()]) {
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        reasonMessage: { code: "gate.identityAmbiguous" },
      });
    }
  },
);

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
  ["review", 200],
  ["implement", 409],
] as const)("resolved ticket preview at %s stage returns %i", async (stage, status) => {
  const resolved = { ...child, state: "closed", state_reason: "completed" };
  const { preview } = await setup(
    { [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [resolved] } },
    stage,
    true,
    resolved,
  );
  const response = await preview();
  expect(response.status, await response.clone().text()).toBe(status);
  if (status === 409)
    expect(await response.json()).toMatchObject({
      reasonMessage: { code: "brief.ticketResolved" },
    });
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

test.each(["clarify", "spec"])("reopening %s invalidates the tickets approval", async (stage) => {
  const { root, git, start } = await setup({}, "implement", true);
  const workflow = parse(readFileSync(join(root, path), "utf8"));
  workflow.stages[stage].reopened = { at: "2026-01-02" };
  writeFileSync(join(root, path), stringify(workflow));
  git("add", path);
  git("commit", "-qm", "reopen stage");
  const response = await start();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ reasonMessage: { code: "gate.evidenceChanged" } });
  expect(existsSync(`${root}-worktrees/github-1`)).toBe(false);
  expect(existsSync(join(root, ".stintwork/local/stints"))).toBe(false);
  expect(git("branch", "--list", "stintwork/github-1")).toBe("");
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

test.each(["updated", "failed", "local"] as const)(
  "stint completion refreshes GitHub detail (%s)",
  async (scenario) => {
    const { root, git, gh, ghReplies } = await setup();
    mkdirSync(join(root, "web"));
    writeFileSync(join(root, "web/index.html"), "<!doctype html>");
    if (scenario === "local") {
      writeFileSync(
        join(root, "docs/agents/issue-tracker.md"),
        "# Issue tracker: Local Markdown\n",
      );
      mkdirSync(join(root, ".scratch/local/issues"), { recursive: true });
      writeFileSync(join(root, ".scratch/local/spec.md"), "# Local\n");
      writeFileSync(
        join(root, ".scratch/local/issues/01-local.md"),
        "# Local\nStatus: ready-for-agent\nBlocked by: none\n",
      );
      git("add", ".");
      git("commit", "-qm", "local tracker");
    }
    const page = JSON.parse(
      readFileSync(
        new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
        "utf8",
      ),
    );
    const item = page.data.repository.issues.nodes[0];
    Object.assign(item, {
      id: "I_1",
      number: 1,
      title: "Parent",
      url: parent.html_url,
      parent: null,
      labels: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      subIssues: {
        nodes: [{ repository: { id: "R_1" }, subIssues: { totalCount: 0 } }],
        totalCount: 1,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    page.data.repository.id = "R_1";
    page.data.repository.nameWithOwner = "Example/Project";
    page.data.repository.issues.nodes = [item];
    page.data.repository.issues.pageInfo = { hasNextPage: false, endCursor: null };
    const replies = { ...ghReplies, "api graphql": { stdout: page } };
    await gh.script(replies);
    let finish = () => {};
    const { createProjectServer } = await import("./index.js");
    const server = createProjectServer(root, join(root, "web"), {
      launchAgent: () => ({
        done: new Promise((resolve) => {
          finish = () => resolve({ stopReason: "end_turn" });
        }),
        cancel: async () => finish(),
      }),
    });
    try {
      const slug = scenario === "local" ? "local" : "github-1";
      const start = await server.app.request("/api/stints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workItem: slug,
          ticket: scenario === "local" ? 1 : 2,
          agent: "codex",
        }),
      });
      expect(start.status, await start.clone().text()).toBe(201);
      const before = (await gh.calls()).length;
      if (scenario === "updated")
        await gh.script({
          ...replies,
          [`${issue}/sub_issues?per_page=100&page=1`]: {
            stdout: [{ ...child, state: "closed", state_reason: "completed" }],
          },
        });
      if (scenario === "failed")
        await gh.script({
          ...replies,
          [issue]: { code: 1, effect: "process.stderr.write('network is unreachable')" },
        });
      finish();
      await expect
        .poll(
          async () =>
            (await (await server.app.request("/api/project")).json()).workItems.find(
              (entry: { slug: string }) => entry.slug === slug,
            )?.stints[0]?.status,
          { timeout: 10000 },
        )
        .toBe("finished");
      if (scenario === "local") {
        expect((await gh.calls()).length).toBe(before);
      } else {
        await expect
          .poll(async () =>
            (await gh.calls())
              .slice(before)
              .some((call) => call.args.slice(0, 2).join(" ") === issue),
          )
          .toBe(true);
        await expect
          .poll(
            async () => {
              const snapshot = await (await server.app.request("/api/project")).json();
              return scenario === "failed"
                ? snapshot.github.items[0].detail?.stale
                : snapshot.workItems[0].tickets[0].resolved;
            },
            { timeout: 10000 },
          )
          .toBe(true);
      }
    } finally {
      await server.stop();
    }
  },
);
