// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  githubEvidenceDigest,
  githubEvidenceDigestV2,
  githubEvidenceDigestV3,
  indexProject,
  createMemoryRepoFiles,
  gateReadiness,
} from "@stintwork/core";
import { Hono } from "hono";
import { afterEach, expect, test } from "vitest";
import { parse } from "yaml";
import { fakeGh, type GhReply } from "../test/fake-gh.js";
import {
  addGithubGateRoutes,
  requireCurrentGithubApproval,
  verifyGithubGateIdentity,
} from "./github-gates.js";
import { createNodeRepoFiles } from "./repo-files.js";
import { createProjectFiles } from "./work-item-files.js";
import { saveGithubWorkflow } from "./workflow-writes.js";
import { readGithubTickets } from "./github-tickets.js";
import { classifyGithubError, type GithubDiscovery } from "./github-discovery.js";
import { projectGithubGates } from "./github-snapshot.js";

const roots: string[] = [];
const oldPath = process.env.PATH;
afterEach(() => {
  process.env.PATH = oldPath;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
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
  sub_issues_summary: { total: 0 },
};
const discovery = {
  repository: "Example/Project",
  repositoryId: "R_1",
  items: [{ id: "I_1", number: 1, title: "Parent", url: parent.html_url, complete: true }],
  scanned: 1,
  cursor: null,
  complete: true,
  pages: [],
  warnings: [],
};
const issue = "api repos/Example/Project/issues/1";
async function setup(
  replies: Record<string, GhReply | GhReply[]> = {},
  initialStage?: string,
  withWorktree = false,
) {
  const root = mkdtempSync(join(tmpdir(), "github-gates-"));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  execFileSync("git", ["init", "-q", root]);
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("remote", "add", "origin", "https://github.com/Example/Project.git");
  git("commit", "--allow-empty", "-qm", "initial");
  const worktreeParent = `${root}-worktrees`;
  const worktree = join(worktreeParent, "github-1");
  if (withWorktree) roots.push(worktreeParent);
  if (withWorktree) git("worktree", "add", "-qb", "stintwork/github-1", worktree);
  const gh = await fakeGh(join(root, "bin"));
  process.env.PATH = gh.path;
  await gh.script({
    "auth status": {},
    "api user": { stdout: { id: 101, login: "101" } },
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_1",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    [issue]: { stdout: parent },
    [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [] },
    [`${issue}/comments?per_page=100&page=1`]: { stdout: [] },
    ...replies,
  });
  const app = new Hono();
  const github: GithubDiscovery = structuredClone(discovery);
  const snapshot = indexProject(
    createMemoryRepoFiles({ "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n" }),
    { name: "test" },
  );
  const stage = initialStage ?? "clarify";
  const workItem = indexProject(
    createMemoryRepoFiles({
      ".scratch/github-1/spec.md": "# Spec",
      ".scratch/github-1/issues/01-first.md": "# Ticket\nStatus: resolved\nBlocked by: none",
    }),
    { name: "test" },
  ).workItems[0];
  workItem.stage = stage;
  workItem.github = {
    repository: discovery.repository,
    repositoryId: discovery.repositoryId,
    issueId: "I_1",
    number: 1,
    url: parent.html_url,
    complete: true,
    bound: withWorktree,
    reviewDigest: "digest",
    reviewHead: "head",
  };
  workItem.stages = Object.fromEntries(
    snapshot.workflows.feature.stages
      .slice(
        0,
        snapshot.workflows.feature.stages.findIndex((entry) => entry.id === stage),
      )
      .map(({ id }) => [id, { approved: { remoteState: "current" } }]),
  );
  workItem.stints = [
    {
      id: "finished",
      workItem: "github-1",
      stage,
      ticket: null,
      agent: "codex",
      status: "finished",
      startedAt: "2099-01-01T00:00:00Z",
      endedAt: "2099-01-01T00:01:00Z",
      checkpointCommit: "checkpoint",
      handoff: {
        stint: "finished",
        agent: "codex",
        stoppedAt: "Done",
        unresolved: "None",
        nextStep: "Approve",
      },
    },
  ];
  snapshot.workItems = [workItem];
  const project = createProjectFiles(root, createNodeRepoFiles(root));
  let discoveryFailure = false;
  let evidenceReads = 0;
  let published = 0;
  let checking = false;
  const writing = new Set<string>();
  addGithubGateRoutes(
    app,
    root,
    () => github,
    () => snapshot,
    Object.assign(
      () => {
        const result = project();
        if (discoveryFailure) result.warnings.push({ path: ".git", message: "Discovery failed" });
        return result;
      },
      { metadataChanged: project.metadataChanged },
    ),
    () => {
      published++;
      snapshot.github = github;
      projectGithubGates(snapshot, root, project());
    },
    () => checking,
    writing,
    (expected) =>
      verifyGithubGateIdentity(root, expected, {
        viewer: { id: 101, login: "101" },
        origin: "Example/Project",
      }),
    (_github, number, error) => {
      const item = github.items.find((entry) => entry.number === number);
      if (!item) throw new Error("Missing item");
      if (classifyGithubError(error).code === "identity") delete item.detail;
      item.complete = false;
      if (item.detail) item.detail.stale = true;
    },
    (_project, current) => {
      evidenceReads++;
      current.workItems[0].reviewEvidenceError = "Evidence changed";
    },
  );
  if (initialStage) {
    const digest = await githubEvidenceDigest(
      { parentId: "I_1", body: "Spec", tickets: [] },
      false,
    );
    const stages = snapshot.workflows.feature.stages;
    const previous = stages.slice(
      0,
      stages.findIndex(({ id }) => id === initialStage),
    );
    await saveGithubWorkflow(
      root,
      discovery,
      discovery.items[0],
      "feature",
      initialStage,
      (text) =>
        `${text}stages:\n${previous.map(({ id }) => `  ${id}:\n    approved:\n      at: '2026-01-01T00:00:00Z'\n      remote: { version: 1, parentId: I_1, digest: '${digest}' }\n`).join("")}`,
    );
  }
  const reviewedHead = withWorktree
    ? execFileSync("git", ["-C", worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
    : git("rev-parse", "HEAD");
  const reviewedDigest = await githubEvidenceDigestV3(
    { parentId: "I_1", body: "Spec", tickets: [] },
    false,
  );
  const request = (body = { stage: "clarify", reviewedDigest, reviewedHead }, action = "approve") =>
    app.request(`/api/github/items/1/gates/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    git,
    app,
    request,
    reviewedHead,
    reviewedDigest,
    root,
    snapshot,
    worktree,
    github,
    writing,
    setChecking: (value: boolean) => {
      checking = value;
    },
    published: () => published,
    failDiscovery: () => {
      discoveryFailure = true;
    },
    evidenceReads: () => evidenceReads,
  };
}
const path = ".stintwork/github/example/project/1/workflow.yaml";

test("historical v2 approval becomes stale on a ticket comment while v3 stays current", async () => {
  const child = {
    ...parent,
    node_id: "I_2",
    number: 2,
    title: "Ticket",
    body: "Ticket",
    html_url: "https://github.com/Example/Project/issues/2",
    comments: 1,
    issue_dependencies_summary: { total_blocked_by: 0 },
  };
  const childPath = "api repos/Example/Project/issues/2";
  const { root } = await setup({
    [issue]: { stdout: { ...parent, sub_issues_summary: { total: 1 } } },
    [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [child] },
    [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/comments?per_page=100&page=1`]: {
      stdout: [{ id: 1, node_id: "C_1", body: "checks" }],
    },
    [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
  });
  const detail = await readGithubTickets(root, "Example/Project", "I_1", 1);
  const before = structuredClone(detail.tickets);
  before[0].commentRecords = [];
  const input = { parentId: "I_1", body: detail.spec, tickets: before };
  for (const [version, digest, expected] of [
    [2, await githubEvidenceDigestV2(input, true), { ok: false, code: "approval-stale" }],
    [3, await githubEvidenceDigestV3(input, true), { ok: true }],
  ] as const) {
    expect(
      await requireCurrentGithubApproval(root, "Example/Project", "I_1", 1, true, [], {
        approved: { remote: { version, parentId: "I_1", digest } },
      }),
    ).toEqual(expected);
  }
});

test.each(["body", "set", "label", "blocker"] as const)(
  "v3 ticket approval becomes stale after a %s change",
  async (change) => {
    const child = {
      ...parent,
      node_id: "I_2",
      number: 2,
      title: "Ticket",
      body: "Ticket",
      html_url: "https://github.com/Example/Project/issues/2",
      issue_dependencies_summary: { total_blocked_by: change === "blocker" ? 1 : 0 },
    };
    const blocker = {
      ...child,
      node_id: "I_3",
      number: 3,
      html_url: "https://github.com/Example/Project/issues/3",
      state: "closed",
    };
    const childPath = "api repos/Example/Project/issues/2";
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
    const digest = await githubEvidenceDigestV3(input, true, ["ready-for-agent"]);
    const { root } = await setup({
      [issue]: { stdout: { ...parent, sub_issues_summary: { total: change === "set" ? 0 : 1 } } },
      [`${issue}/sub_issues?per_page=100&page=1`]: {
        stdout:
          change === "set" ? [] : [{ ...child, body: change === "body" ? "edited" : "Ticket" }],
      },
      [`${childPath}/labels?per_page=100&page=1`]: {
        stdout: change === "label" ? [{ name: "ready-for-agent" }] : [],
      },
      [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
      [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: {
        stdout: change === "blocker" ? [blocker] : [],
      },
    });
    expect(
      await requireCurrentGithubApproval(
        root,
        "Example/Project",
        "I_1",
        1,
        true,
        ["ready-for-agent"],
        {
          approved: { remote: { version: 3, parentId: "I_1", digest } },
        },
      ),
    ).toEqual({ ok: false, code: "approval-stale" });
  },
);

test("server refuses gate writes after discovery or viewer failure until discovery recovers", async () => {
  const { root, git, reviewedDigest } = await setup({}, "spec");
  const reviewedHead = git("rev-parse", "HEAD");
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  writeFileSync(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web/index.html"), "<!doctype html>");
  const gh = await fakeGh(join(root, "server-bin"));
  process.env.PATH = gh.path;
  const connection = (nodes: unknown[]) => ({
    nodes,
    pageInfo: { hasNextPage: false, endCursor: null },
  });
  const replies = {
    "auth status": {},
    "config get": { stdout: "101" },
    "api user": { stdout: { id: 101, login: "101" } },
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_1",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": {
      stdout: {
        data: {
          repository: {
            id: "R_1",
            nameWithOwner: "Example/Project",
            issues: connection([
              {
                id: "I_1",
                number: 1,
                title: "Parent",
                url: parent.html_url,
                parent: null,
                labels: connection([{ name: "stintwork:work-item" }]),
                subIssues: { ...connection([]), totalCount: 0 },
              },
            ]),
          },
          rateLimit: { cost: 1, remaining: 4999, resetAt: "2099-01-01T00:00:00Z" },
        },
      },
    },
    [issue]: { stdout: parent },
    [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [] },
    [`${issue}/comments?per_page=100&page=1`]: { stdout: [] },
  };
  await gh.script(replies);
  const { createProjectServer } = await import("./index.js");
  const server = createProjectServer(root, join(root, "web"));
  const request = (action: string) =>
    server.app.request(`/api/github/items/1/gates/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "clarify", reviewedDigest, reviewedHead }),
    });
  try {
    await server.app.request("/api/project");
    await gh.script({
      ...replies,
      "api graphql": { code: 1, effect: "process.stderr.write('network is unreachable')" },
    });
    await server.app.request("/api/github/discovery/refresh", { method: "POST" });
    for (const action of ["approve", "reopen"]) {
      const response = await request(action);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "detail-unavailable" });
    }
    expect(git("rev-parse", "HEAD")).toBe(reviewedHead);
    await gh.script({
      ...replies,
      "api user": { code: 1, effect: "process.stderr.write('network is unreachable')" },
    });
    await server.app.request("/api/github/discovery/refresh", { method: "POST" });
    expect((await request("reopen")).status).toBe(409);
    expect(git("rev-parse", "HEAD")).toBe(reviewedHead);
    await gh.script(replies);
    await server.app.request("/api/github/discovery/refresh", { method: "POST" });
    const recovered = await request("reopen");
    expect(recovered.status, await recovered.clone().text()).toBe(200);
    expect(git("rev-parse", "HEAD")).not.toBe(reviewedHead);
  } finally {
    await server.stop();
  }
});

test("rejects cross-origin, non-JSON, malformed and non-object requests", async () => {
  const { app, git } = await setup();
  for (const [headers, body, status, code] of [
    [
      { origin: "https://elsewhere.test", "content-type": "application/json" },
      "{}",
      403,
      "server.originMismatch",
    ],
    [{ "content-type": "text/plain" }, "{}", 400, "server.jsonGate"],
    [{ "content-type": "application/json" }, "{", 400, "server.invalidJson"],
    [{ "content-type": "application/json" }, "[]", 400, "server.jsonGate"],
  ] as const) {
    const response = await app.request("/api/github/items/1/gates/approve", {
      method: "POST",
      headers,
      body,
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ reasonMessage: { code } });
  }
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});

test("refuses a missing GitHub work item", async () => {
  const { app, git } = await setup();
  const response = await app.request("/api/github/items/2/gates/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stage: "clarify", reviewedDigest: "x", reviewedHead: "x" }),
  });
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({
    reasonMessage: { code: "server.workItemNotFound" },
  });
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});

test("refuses missing, noncurrent and non-earlier stages with local codes", async () => {
  const { request, reviewedHead, reviewedDigest, git } = await setup({}, "spec");
  for (const [stage, action, status, code] of [
    ["absent", "approve", 400, "server.stageNotFound"],
    ["clarify", "approve", 409, "gate.notCurrentStage"],
    ["spec", "reopen", 409, "gate.reopenEarlier"],
    ["tickets", "reopen", 409, "gate.reopenEarlier"],
  ] as const) {
    const response = await request({ stage, reviewedHead, reviewedDigest }, action);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ reasonMessage: { code } });
  }
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

test("refreshes Clarify memory proposals before checking readiness", async () => {
  const { request, snapshot, git } = await setup();
  snapshot.workItems[0].stints = [];
  snapshot.workItems[0].memoryProposalError = "stale error";
  const response = await request();
  expect(response.status).toBe(409);
  expect(snapshot.workItems[0].memoryProposalError).toBeUndefined();
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});

test.each(["approve", "reopen"] as const)(
  "%s refuses a shipped record without writing",
  async (action) => {
    const { root, git, request, reviewedDigest } = await setup({}, "spec");
    const file = join(root, path);
    writeFileSync(
      file,
      `${readFileSync(file, "utf8")}merged: { at: '2026-01-01T00:00:00Z', commit: '${"a".repeat(40)}' }\n`,
    );
    git("add", path);
    git("commit", "-qm", "ship");
    const before = readFileSync(file, "utf8");
    const head = git("rev-parse", "HEAD");
    const response = await request(
      { stage: action === "approve" ? "spec" : "clarify", reviewedDigest, reviewedHead: head },
      action,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reasonMessage: { code: "workItem.shipped" } });
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(readFileSync(file, "utf8")).toBe(before);
  },
);

test.each([false, true])(
  "copied checkout approvals remain current when the first worktree approval races: %s",
  async (advanceHead) => {
    const child = {
      ...parent,
      node_id: "I_2",
      number: 2,
      html_url: "https://github.com/Example/Project/issues/2",
      body: "Ticket",
      issue_dependencies_summary: { total_blocked_by: 0 },
    };
    const childPath = "api repos/Example/Project/issues/2";
    const { request, reviewedHead, root, worktree, git, snapshot, github } = await setup(
      {
        [issue]: { stdout: { ...parent, sub_issues_summary: { total: 1 } } },
        [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [child] },
        [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
        [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
        [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
      },
      "tickets",
      true,
    );
    const checkout = readFileSync(join(root, path), "utf8").replaceAll(
      "      at: '2026-01-01T00:00:00Z'",
      `      at: '2026-01-01T00:00:00Z'\n      commit: '${reviewedHead}'`,
    );
    writeFileSync(join(root, path), checkout);
    git("add", path);
    git("commit", "--amend", "-qm", "checkout approvals");
    if (advanceHead) {
      const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
      writeFileSync(
        join(root, "bin", "git"),
        `#!/bin/sh\ncase " $* " in\n  *" commit "*) old=$("${realGit}" rev-parse HEAD); new=$(printf 'external\\n' | "${realGit}" commit-tree HEAD^{tree} -p "$old"); "${realGit}" update-ref HEAD "$new" "$old" ;;\nesac\nexec "${realGit}" "$@"\n`,
        { mode: 0o755 },
      );
    }
    const detail = await readGithubTickets(root, "Example/Project", "I_1", 1);
    const reviewedDigest = await githubEvidenceDigestV3(
      { parentId: "I_1", body: detail.spec, tickets: detail.tickets },
      true,
    );
    const response = await request({ stage: "tickets", reviewedHead, reviewedDigest });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toEqual(
      advanceHead ? { approval: "stale", reason: "head-changed" } : { approval: "current" },
    );
    snapshot.workItems[0].stages = parse(readFileSync(join(worktree, path), "utf8")).stages;
    github.items[0].detail = { ...detail, fetchedAt: new Date().toISOString() };
    snapshot.github = github;
    projectGithubGates(snapshot, root, createProjectFiles(root, createNodeRepoFiles(root))());
    expect(snapshot.workItems[0].stages.spec.approved).toMatchObject({ remoteState: "current" });
    expect(snapshot.workItems[0].stages.tickets.approved).toMatchObject(
      advanceHead
        ? { remoteState: "stale", remoteStateReason: "head-changed" }
        : { remoteState: "current" },
    );
  },
);

test.each(["approve", "reopen"] as const)(
  "%s refuses a structurally invalid workflow without writing",
  async (action) => {
    const { root, git, request, reviewedDigest } = await setup({}, "spec");
    const file = join(root, path);
    const before = readFileSync(file, "utf8").replace(
      /stages:\n[\s\S]*/,
      "stages:\n  clarify: invalid\n",
    );
    writeFileSync(file, before);
    git("add", path);
    git("commit", "-qm", "invalid record");
    const head = git("rev-parse", "HEAD");
    const response = await request(
      { stage: action === "approve" ? "spec" : "clarify", reviewedDigest, reviewedHead: head },
      action,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reasonMessage: { code: "gate.validWorkflowRequired" },
    });
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(readFileSync(file, "utf8")).toBe(before);
  },
);

test("refuses a snapshot active stint", async () => {
  const { request, snapshot, git } = await setup();
  snapshot.workItems[0].activeStint = snapshot.workItems[0].stints[0] as NonNullable<
    (typeof snapshot.workItems)[0]["activeStint"]
  >;
  const response = await request();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ reasonMessage: { code: "gate.activeWrite" } });
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});

test("refuses failed worktree discovery", async () => {
  const { request, failDiscovery, git } = await setup();
  failDiscovery();
  expect((await request()).status).toBe(503);
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});

test("refreshes Review evidence before checking readiness", async () => {
  const { request, reviewedHead, reviewedDigest, evidenceReads, git } = await setup({}, "review");
  const response = await request({ stage: "review", reviewedHead, reviewedDigest });
  expect(response.status).toBe(409);
  expect(evidenceReads()).toBe(1);
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

test.each(["approve", "reopen"] as const)(
  "%s publishes unknown approvals on a failed fresh read",
  async (action) => {
    for (const failure of ["network", "identity"] as const) {
      const reply =
        failure === "network"
          ? { code: 1, effect: "process.stderr.write('network unreachable')" }
          : { stdout: { ...parent, node_id: "I_changed" } };
      const { request, reviewedHead, reviewedDigest, github, snapshot, published, git, root } =
        await setup({ [issue]: reply }, "spec");
      github.items[0].detail = {
        spec: "Spec",
        comments: [],
        tickets: [],
        complete: true,
        fetchedAt: new Date().toISOString(),
        warnings: [],
      };
      snapshot.github = github;
      snapshot.workItems[0].stages = parse(readFileSync(join(root, path), "utf8")).stages;
      projectGithubGates(snapshot, root, createProjectFiles(root, createNodeRepoFiles(root))());
      expect(snapshot.workItems[0].stages.clarify.approved).toMatchObject({
        remoteState: "current",
      });
      const response = await request(
        { stage: action === "approve" ? "spec" : "clarify", reviewedHead, reviewedDigest },
        action,
      );
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe("detail-unavailable");
      expect(published()).toBe(1);
      expect(snapshot.workItems[0].stages.clarify.approved).toMatchObject({
        remoteState: "unknown",
      });
      if (failure === "identity") expect(github.items[0].detail).toBeUndefined();
      else expect(github.items[0].detail).toMatchObject({ spec: "Spec", stale: true });
      expect(git("rev-list", "--count", "HEAD")).toBe("2");
    }
  },
);

test.each(["closed", "open", "inaccessible"] as const)(
  "external %s blocker determines GitHub tickets readiness",
  async (state) => {
    const child = {
      ...parent,
      node_id: "I_2",
      number: 2,
      html_url: "https://github.com/Example/Project/issues/2",
      body: "Blocked by: #99",
      issue_dependencies_summary: { total_blocked_by: 0 },
    };
    const childPath = "api repos/Example/Project/issues/2";
    const { root, snapshot, request, reviewedDigest, reviewedHead } = await setup(
      {
        [issue]: { stdout: { ...parent, sub_issues_summary: { total: 1 } } },
        [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [child] },
        [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
        [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
        [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
        "api repos/Example/Project/issues/99":
          state === "inaccessible"
            ? { code: 1, effect: "console.error('HTTP 404')" }
            : {
                stdout: {
                  ...parent,
                  node_id: "I_99",
                  number: 99,
                  html_url: "https://github.com/Example/Project/issues/99",
                  state,
                },
              },
      },
      "tickets",
    );
    const detail = await readGithubTickets(root, "Example/Project", "I_1", 1);
    const files = createMemoryRepoFiles({
      "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n",
    });
    const projected = indexProject(files, {
      name: "test",
      github: { ...discovery, items: [{ ...discovery.items[0], bound: true, detail }] },
    }).workItems[0];
    const item = snapshot.workItems[0];
    item.tickets = projected.tickets;
    item.outputWarnings = projected.outputWarnings;
    if (!item.github) throw new Error("Missing GitHub metadata");
    item.github.complete = detail.complete;
    expect(gateReadiness(item).ready).toBe(state === "closed");
    if (state === "inaccessible") {
      expect(JSON.stringify(gateReadiness(item).conditions)).toContain(
        "Issue #2: text blockers unknown.",
      );
      const response = await request({ stage: "tickets", reviewedDigest, reviewedHead });
      expect(response.status).toBe(409);
      expect(JSON.stringify(await response.json())).toContain("Issue #2: text blockers unknown.");
    }
  },
);

test.each(["mixed", "open external", "cycle", "missing", "unknown state"] as const)(
  "approval revalidates dependencies: %s",
  async (scenario) => {
    const issueFor = (number: number, state = "open") => ({
      ...parent,
      node_id: `I_${number}`,
      number,
      html_url: `https://github.com/Example/Project/issues/${number}`,
      state,
      body: "Ticket",
      issue_dependencies_summary: { total_blocked_by: 0 },
    });
    const first = issueFor(11);
    const second = issueFor(12);
    const external = issueFor(
      99,
      scenario === "mixed" ? "closed" : scenario === "unknown state" ? "unknown" : "open",
    );
    const firstBlockers = scenario === "cycle" ? [second] : [];
    const secondBlockers =
      scenario === "cycle" ? [first] : scenario === "missing" ? [] : [first, external];
    if (scenario === "missing") second.body = "Blocked by: #99";
    first.issue_dependencies_summary.total_blocked_by = firstBlockers.length;
    second.issue_dependencies_summary.total_blocked_by = secondBlockers.length;
    const replies: Record<string, GhReply> = {
      [issue]: { stdout: { ...parent, sub_issues_summary: { total: 2 } } },
      [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [first, second] },
      "api repos/Example/Project/issues/99": { code: 1, effect: "console.error('HTTP 404')" },
    };
    for (const [child, blockers] of [
      [first, firstBlockers],
      [second, secondBlockers],
    ] as const) {
      const path = `api repos/Example/Project/issues/${child.number}`;
      replies[`${path}/labels?per_page=100&page=1`] = { stdout: [] };
      replies[`${path}/comments?per_page=100&page=1`] = { stdout: [] };
      replies[`${path}/dependencies/blocked_by?per_page=100&page=1`] = { stdout: blockers };
    }
    const { root, request, reviewedHead } = await setup(replies, "tickets");
    let reviewedDigest = "unavailable";
    try {
      const detail = await readGithubTickets(root, "Example/Project", "I_1", 1);
      reviewedDigest = await githubEvidenceDigestV3(
        { parentId: "I_1", body: detail.spec, tickets: detail.tickets },
        true,
      );
    } catch {
      /* Invalid remote data must be refused by the approval read. */
    }
    const response = await request({ stage: "tickets", reviewedHead, reviewedDigest });
    expect(response.status, await response.clone().text()).toBe(scenario === "mixed" ? 200 : 409);
  },
);

test.each(["approve", "reopen"] as const)(
  "%s preserves checkout history when the worktree has no record",
  async (action) => {
    const child = {
      ...parent,
      node_id: "I_2",
      number: 2,
      html_url: "https://github.com/Example/Project/issues/2",
      body: "Ticket",
      issue_dependencies_summary: { total_blocked_by: 0 },
    };
    const childPath = "api repos/Example/Project/issues/2";
    const { request, reviewedHead, worktree } = await setup(
      {
        [issue]: { stdout: { ...parent, sub_issues_summary: { total: 1 } } },
        [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [child] },
        [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
        [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
        [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
      },
      "tickets",
      true,
    );
    const reviewedDigest = await githubEvidenceDigestV3(
      {
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
      },
      true,
    );
    const response = await request(
      { stage: action === "approve" ? "tickets" : "spec", reviewedHead, reviewedDigest },
      action,
    );
    expect(response.status, await response.text()).toBe(200);
    const result = parse(readFileSync(join(worktree, path), "utf8"));
    expect(result.stages.spec.approved.remote.parentId).toBe("I_1");
    expect(
      result.stages[action === "approve" ? "tickets" : "spec"][
        action === "approve" ? "approved" : "reopened"
      ],
    ).toBeDefined();
  },
);

test("refuses a direct approval when readiness is unmet without committing", async () => {
  const { snapshot, request, git } = await setup();
  snapshot.workItems[0].stints = [];
  const response = await request();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ reasonMessage: { code: "gate.stintUnfinished" } });
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});

test.each([
  ["viewer changed", { "api user": { stdout: { id: 202, login: "202" } } }],
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
] as const)("refuses %s before approve or reopen", async (_case, replies) => {
  const { request, git, reviewedHead, reviewedDigest } = await setup(replies, "spec");
  for (const action of ["approve", "reopen"] as const) {
    const response = await request(
      { stage: action === "approve" ? "spec" : "clarify", reviewedHead, reviewedDigest },
      action,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "identity",
      reasonMessage: { code: "gate.identityAmbiguous" },
    });
  }
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

test("reopens an earlier GitHub gate and retains its approval", async () => {
  const { git, request, reviewedHead } = await setup({}, "tickets");
  const reviewedDigest = await githubEvidenceDigestV3(
    { parentId: "I_1", body: "Spec", tickets: [] },
    true,
  );
  const response = await request({ stage: "spec", reviewedDigest, reviewedHead }, "reopen");
  expect(response.status).toBe(200);
  expect(parse(git("show", `HEAD:${path}`))).toMatchObject({
    stage: "spec",
    stages: {
      spec: { approved: { remote: { parentId: "I_1" } }, reopened: { commit: reviewedHead } },
    },
  });
  const specDigest = await githubEvidenceDigestV3(
    { parentId: "I_1", body: "Spec", tickets: [] },
    false,
  );
  expect(
    (
      await request({
        stage: "spec",
        reviewedDigest: specDigest,
        reviewedHead: git("rev-parse", "HEAD"),
      })
    ).status,
  ).toBe(409);
});

test("refuses a later approval when earlier evidence is unavailable", async () => {
  for (const reply of [{ code: 1 }]) {
    const { git, request, reviewedHead } = await setup({ [issue]: reply }, "spec");
    const reviewedDigest = await githubEvidenceDigestV3(
      { parentId: "I_1", body: "Changed", tickets: [] },
      false,
    );
    expect((await request({ stage: "spec", reviewedDigest, reviewedHead })).status).toBe(409);
    expect(git("rev-list", "--count", "HEAD")).toBe("2");
  }
});

test("creates and commits a current approval", async () => {
  const { git, request, reviewedHead, reviewedDigest } = await setup();
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ approval: "current" });
  const yaml = git("show", `HEAD:${path}`);
  expect(parse(yaml)).toEqual({
    workflow: "feature",
    stage: "spec",
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
        approved: {
          by: "Test",
          at: expect.any(String),
          commit: reviewedHead,
          remote: { version: 3, parentId: "I_1", digest: reviewedDigest },
        },
      },
    },
  });
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

test("first approval creates the record in an unbound worktree", async () => {
  const { request, root, snapshot, worktree } = await setup({}, undefined, true);
  if (!snapshot.workItems[0].github) throw new Error("Missing GitHub metadata");
  snapshot.workItems[0].github.bound = false;
  const response = await request();
  expect(response.status, await response.text()).toBe(200);
  expect(parse(readFileSync(join(worktree, path), "utf8")).stages.clarify.approved).toBeDefined();
  expect(() => readFileSync(join(root, path))).toThrow();
});

test("refuses a mismatched record in an unbound worktree", async () => {
  const { request, snapshot, worktree } = await setup({}, undefined, true);
  if (!snapshot.workItems[0].github) throw new Error("Missing GitHub metadata");
  snapshot.workItems[0].github.bound = false;
  mkdirSync(join(worktree, path, ".."), { recursive: true });
  const existing = "workflow: feature\nstage: clarify\ngithub:\n  issueId: I_other\n";
  writeFileSync(join(worktree, path), existing);
  const response = await request();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    code: "identity",
    reasonMessage: { code: "gate.identityAmbiguous" },
  });
  expect(readFileSync(join(worktree, path), "utf8")).toBe(existing);
});

test("refuses incomplete detail without a commit", async () => {
  const child = {
    ...parent,
    node_id: "I_2",
    number: 2,
    html_url: "https://github.com/Example/Project/issues/2",
    sub_issues_summary: { total: 1 },
    issue_dependencies_summary: { total_blocked_by: 0 },
  };
  const childPath = "api repos/Example/Project/issues/2";
  const { request, git } = await setup({
    [issue]: { stdout: { ...parent, sub_issues_summary: { total: 1 } } },
    [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [child] },
    [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
  });
  const response = await request();
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("detail-unavailable");
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});

test.each(["spec", "clarify", "tickets"] as const)(
  "handles unknown dependencies when operating on %s",
  async (stage) => {
    const child = {
      ...parent,
      node_id: "I_2",
      number: 2,
      html_url: "https://github.com/Example/Project/issues/2",
      body: "Blocked by: unclear",
      issue_dependencies_summary: { total_blocked_by: 0 },
    };
    const childPath = "api repos/Example/Project/issues/2";
    const initialStage = stage === "spec" ? "spec" : "tickets";
    const { root, request, git, reviewedHead, reviewedDigest, github } = await setup(
      {
        [issue]: { stdout: { ...parent, sub_issues_summary: { total: 1 } } },
        [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [child] },
        [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
        [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
        [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
      },
      initialStage,
    );
    const detail = await readGithubTickets(root, "Example/Project", "I_1", 1);
    expect(detail.complete).toBe(false);
    const digest =
      initialStage === "tickets"
        ? await githubEvidenceDigestV3(
            { parentId: "I_1", body: detail.spec, tickets: detail.tickets },
            true,
          )
        : reviewedDigest;
    const response = await request(
      { stage, reviewedDigest: digest, reviewedHead },
      stage === "clarify" ? "reopen" : "approve",
    );
    if (stage === "tickets") {
      expect(response.status).toBe(409);
      expect(JSON.stringify(await response.json())).toContain("Issue #2: text blockers unknown.");
      expect(git("rev-list", "--count", "HEAD")).toBe("2");
    } else {
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toEqual({ approval: "current" });
      const record = parse(git("show", `HEAD:${path}`)).stages[stage];
      expect(record[stage === "clarify" ? "reopened" : "approved"].remote).toMatchObject({
        version: 3,
        parentId: "I_1",
        digest,
      });
      expect(github.items[0].detail?.stale).not.toBe(true);
    }
  },
);

test("detail refresh exposes Spec readiness to the approval route", async () => {
  const { root, git } = await setup({}, "spec");
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  writeFileSync(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web/index.html"), "<!doctype html>");
  const head = git("rev-parse", "HEAD");
  const log = join(root, ".stintwork/local/stints/spec.jsonl");
  mkdirSync(join(root, ".stintwork/local/stints"), { recursive: true });
  writeFileSync(
    log,
    [
      {
        type: "started",
        at: "2099-01-01T00:00:00Z",
        stint: {
          id: "spec",
          workItem: "github-1",
          stage: "spec",
          ticket: null,
          agent: "codex",
          worktree: { path: root, branch: "main" },
          baseCommit: head,
          brief: { prompt: "", skill: null, lastHandoff: null, changedPaths: [], pointers: [] },
        },
      },
      {
        type: "ended",
        at: "2099-01-01T00:01:00Z",
        status: "finished",
        checkpointCommit: head,
        handoff: {
          stint: "spec",
          agent: "codex",
          stoppedAt: "Done",
          unresolved: "None",
          nextStep: "Approve",
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n",
  );
  const child = {
    ...parent,
    node_id: "I_2",
    number: 2,
    html_url: "https://github.com/Example/Project/issues/2",
    body: "Blocked by: unclear",
    issue_dependencies_summary: { total_blocked_by: 0 },
  };
  const childPath = "api repos/Example/Project/issues/2";
  const connection = (nodes: unknown[]) => ({
    nodes,
    pageInfo: { hasNextPage: false, endCursor: null },
  });
  const gh = await fakeGh(join(root, "server-bin"));
  process.env.PATH = gh.path;
  await gh.script({
    "auth status": {},
    "config get": { stdout: "101" },
    "api user": { stdout: { id: 101, login: "101" } },
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_1",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": {
      stdout: {
        data: {
          repository: {
            id: "R_1",
            nameWithOwner: "Example/Project",
            issues: connection([
              {
                id: "I_1",
                number: 1,
                title: "Parent",
                url: parent.html_url,
                parent: null,
                labels: connection([{ name: "stintwork:work-item" }]),
                subIssues: { ...connection([]), totalCount: 0 },
              },
            ]),
          },
          rateLimit: { cost: 1, remaining: 4999, resetAt: "2099-01-01T00:00:00Z" },
        },
      },
    },
    [issue]: { stdout: { ...parent, sub_issues_summary: { total: 1 } } },
    [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [child] },
    [`${issue}/comments?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
  });
  const { createProjectServer } = await import("./index.js");
  const server = createProjectServer(root, join(root, "web"));
  try {
    const response = await server.app.request("/api/github/items/1/refresh", { method: "POST" });
    expect(response.status, await response.clone().text()).toBe(200);
    const snapshot = await response.json();
    const item = snapshot.workItems[0];
    expect(item.github).toMatchObject({ complete: false, dependenciesUnknown: true });
    expect(gateReadiness(item, snapshot.workflows).ready).toBe(true);
    const approve = await server.app.request("/api/github/items/1/gates/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stage: "spec",
        reviewedDigest: item.github.reviewDigest,
        reviewedHead: item.github.reviewHead,
      }),
    });
    expect(approve.status, await approve.clone().text()).toBe(200);
    const next = await (await server.app.request("/api/project")).json();
    expect(gateReadiness(next.workItems[0], next.workflows)).toMatchObject({
      ready: false,
      reason: { text: expect.stringContaining("Issue #2: text blockers unknown.") },
    });
    const tickets = await server.app.request("/api/github/items/1/gates/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stage: "tickets",
        reviewedDigest: "unavailable",
        reviewedHead: git("rev-parse", "HEAD"),
      }),
    });
    expect(tickets.status).toBe(409);
    expect(JSON.stringify(await tickets.json())).toContain("Issue #2: text blockers unknown.");
    expect(next.workItems[0].github.reviewDigest).toBeUndefined();
    expect(next.workItems[0].github.reopenDigest).toEqual(expect.any(String));
    const reopen = await server.app.request("/api/github/items/1/gates/reopen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stage: "spec",
        reviewedDigest: next.workItems[0].github.reopenDigest,
        reviewedHead: next.workItems[0].github.reviewHead,
      }),
    });
    expect(reopen.status, await reopen.clone().text()).toBe(200);
  } finally {
    await server.stop();
  }
});

test("reopens Spec with unknown dependencies", async () => {
  // Covered separately because Spec approval and reopening start at different stages.
  const child = {
    ...parent,
    node_id: "I_2",
    number: 2,
    html_url: "https://github.com/Example/Project/issues/2",
    body: "Blocked by: unclear",
    issue_dependencies_summary: { total_blocked_by: 0 },
  };
  const childPath = "api repos/Example/Project/issues/2";
  const { root, request, reviewedHead } = await setup(
    {
      [issue]: { stdout: { ...parent, sub_issues_summary: { total: 1 } } },
      [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [child] },
      [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
      [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
      [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
    },
    "tickets",
  );
  const detail = await readGithubTickets(root, "Example/Project", "I_1", 1);
  const reviewedDigest = await githubEvidenceDigestV3(
    { parentId: "I_1", body: detail.spec, tickets: detail.tickets },
    true,
  );
  const response = await request({ stage: "spec", reviewedDigest, reviewedHead }, "reopen");
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await response.json()).toEqual({ approval: "current" });
});

test("marks a failed post-check after dependency-only incomplete detail as failed", async () => {
  const child = {
    ...parent,
    node_id: "I_2",
    number: 2,
    html_url: "https://github.com/Example/Project/issues/2",
    body: "Blocked by: unclear",
    issue_dependencies_summary: { total_blocked_by: 0 },
  };
  const childPath = "api repos/Example/Project/issues/2";
  const { request, github } = await setup({
    [issue]: [{ stdout: { ...parent, sub_issues_summary: { total: 1 } } }, { code: 1 }],
    [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [child] },
    [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
  });
  expect(await (await request()).json()).toEqual({ approval: "unknown" });
  expect(github.items[0].complete).toBe(false);
});
test("refuses changed evidence without a commit", async () => {
  const { request, git, reviewedHead } = await setup();
  const response = await request({ stage: "clarify", reviewedDigest: "wrong", reviewedHead });
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("evidence-changed");
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});
test("refuses changed HEAD without a commit", async () => {
  const { request, git, reviewedDigest } = await setup();
  const response = await request({ stage: "clarify", reviewedDigest, reviewedHead: "wrong" });
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("head-changed");
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});
test("reports stale when remote evidence changes after commit", async () => {
  const { request, git } = await setup({
    [issue]: [{ stdout: parent }, { stdout: { ...parent, body: "Changed" } }],
  });
  expect(await (await request()).json()).toEqual({ approval: "stale" });
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});
test("reports unknown when the post-check fails", async () => {
  const { request, git } = await setup({ [issue]: [{ stdout: parent }, { code: 1 }] });
  expect(await (await request()).json()).toEqual({ approval: "unknown" });
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});
test("concurrent approvals create only one commit", async () => {
  const { request, git } = await setup();
  const responses = await Promise.all([request(), request()]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

test("refuses active checks and shared workflow writes, then allows approval", async () => {
  const { request, setChecking, writing, git } = await setup();
  setChecking(true);
  let response = await request();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ reasonMessage: { code: "gate.activeWrite" } });
  setChecking(false);
  writing.add("github-1");
  response = await request();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ reasonMessage: { code: "gate.activeWrite" } });
  writing.delete("github-1");
  expect((await request()).status).toBe(200);
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

test("records a stale approval when HEAD advances during the commit", async () => {
  const { request, git, root, snapshot, github, reviewedHead } = await setup();
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  writeFileSync(
    join(root, "bin", "git"),
    `#!/bin/sh\ncase " $* " in\n  *" commit "*) old=$("${realGit}" rev-parse HEAD); new=$(printf 'external\\n' | "${realGit}" commit-tree HEAD^{tree} -p "$old"); "${realGit}" update-ref HEAD "$new" "$old" ;;\nesac\nexec "${realGit}" "$@"\n`,
    { mode: 0o755 },
  );
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ approval: "stale", reason: "head-changed" });
  expect(git("rev-parse", "HEAD^")).not.toBe(reviewedHead);
  const record = parse(git("show", `HEAD:${path}`)).stages.clarify;
  expect(record.approved.commit).toBe(reviewedHead);
  snapshot.workItems[0].stages.clarify = record;
  github.items[0].detail = {
    spec: "Spec",
    comments: [],
    tickets: [],
    complete: true,
    fetchedAt: new Date().toISOString(),
    warnings: [],
  };
  snapshot.github = github;
  projectGithubGates(snapshot, root, createProjectFiles(root, createNodeRepoFiles(root))());
  expect(snapshot.workItems[0].stages.clarify.approved).toMatchObject({
    remoteState: "stale",
    remoteStateReason: "head-changed",
  });
});

test("concurrent reopen and approval have one winner and leave a valid workflow", async () => {
  const { request, git, reviewedHead, root } = await setup({}, "tickets");
  const reviewedDigest = await githubEvidenceDigestV3(
    { parentId: "I_1", body: "Spec", tickets: [] },
    true,
  );
  const responses = await Promise.all([
    request({ stage: "spec", reviewedDigest, reviewedHead }, "reopen"),
    request({ stage: "tickets", reviewedDigest, reviewedHead }),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(git("rev-list", "--count", "HEAD")).toBe("3");
  expect(parse(readFileSync(join(root, path), "utf8"))).toEqual(parse(git("show", `HEAD:${path}`)));
});

test("failed reopen commit restores workflow and index", async () => {
  const { request, git, reviewedHead, root } = await setup({}, "tickets");
  const before = readFileSync(join(root, path), "utf8");
  const index = git("ls-files", "--stage", "--", path);
  const hooks = join(root, "hooks");
  mkdirSync(hooks);
  writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  git("config", "core.hooksPath", hooks);
  const reviewedDigest = await githubEvidenceDigestV3(
    { parentId: "I_1", body: "Spec", tickets: [] },
    true,
  );
  expect((await request({ stage: "spec", reviewedDigest, reviewedHead }, "reopen")).status).toBe(
    503,
  );
  expect(readFileSync(join(root, path), "utf8")).toBe(before);
  expect(git("ls-files", "--stage", "--", path)).toBe(index);
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

test.each([
  ["spec", "current", false],
  ["tickets", "stale", false],
  ["spec", "stale", true],
] as const)(
  "%s approval is %s after a ticket edit (custom: %s)",
  async (stage, expected, custom) => {
    const child = {
      ...parent,
      node_id: "I_2",
      number: 2,
      html_url: "https://github.com/Example/Project/issues/2",
      body: "Ticket",
      issue_dependencies_summary: { total_blocked_by: 0 },
    };
    const childPath = "api repos/Example/Project/issues/2";
    const { request, reviewedHead, snapshot, git } = await setup(
      {
        [issue]: { stdout: { ...parent, sub_issues_summary: { total: 1 } } },
        [`${issue}/sub_issues?per_page=100&page=1`]: [
          { stdout: [child] },
          { stdout: [{ ...child, body: "Changed ticket" }] },
        ],
        [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
        [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
        [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
      },
      stage,
    );
    if (custom) {
      snapshot.workflows.feature = {
        ...snapshot.workflows.feature,
        stages: snapshot.workflows.feature.stages.map((entry) => ({
          ...entry,
          gate: entry.id === "spec" ? "tickets" : entry.id === "tickets" ? "manual" : entry.gate,
        })),
      };
    }
    const reviewedDigest = await githubEvidenceDigestV3(
      {
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
      },
      stage === "tickets" || custom,
    );
    const response = await request({ stage, reviewedHead, reviewedDigest });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approval: expected });
    expect(parse(git("show", `HEAD:${path}`)).stages[stage].approved.remote.version).toBe(3);
    expect(parse(git("show", `HEAD:${path}`)).stages[stage].approved.remote.digest).toBe(
      reviewedDigest,
    );
  },
);

test("Spec approval accepts an earlier v1 approval after the parent body changes", async () => {
  const { request, reviewedHead } = await setup(
    { [issue]: { stdout: { ...parent, body: "Published spec" } } },
    "spec",
  );
  const reviewedDigest = await githubEvidenceDigestV3(
    { parentId: "I_1", body: "Published spec", tickets: [] },
    false,
  );
  const response = await request({ stage: "spec", reviewedHead, reviewedDigest });
  expect(response.status, await response.clone().text()).toBe(200);
});

test("fresh approval check distinguishes missing, unknown, stale, current and unavailable", async () => {
  const { root, reviewedDigest } = await setup();
  const check = (record: Parameters<typeof requireCurrentGithubApproval>[6]) =>
    requireCurrentGithubApproval(root, "Example/Project", "I_1", 1, false, [], record);
  expect(await check(undefined)).toEqual({ ok: false, code: "approval-missing" });
  expect(await check({ approved: {} })).toEqual({ ok: false, code: "approval-unknown" });
  const approval = {
    at: "2026-01-01",
    remote: { version: 3, parentId: "I_1", digest: reviewedDigest },
  };
  expect(
    await check({ approved: { ...approval, remote: { ...approval.remote, digest: "old" } } }),
  ).toEqual({ ok: false, code: "approval-stale" });
  expect(await check({ approved: approval, reopened: { at: "2026-01-02" } })).toEqual({
    ok: false,
    code: "approval-stale",
  });
  expect(await check({ approved: approval })).toEqual({ ok: true });
  for (const version of [1, 2, 3]) {
    const old = { ...approval, remote: { ...approval.remote, version, digest: "old" } };
    expect(
      await requireCurrentGithubApproval(
        root,
        "Example/Project",
        "I_1",
        1,
        false,
        [],
        { approved: old },
        undefined,
        true,
      ),
    ).toEqual({ ok: true });
    expect(
      await requireCurrentGithubApproval(
        root,
        "Example/Project",
        "I_1",
        1,
        false,
        [],
        { approved: { ...old, remote: { ...old.remote, parentId: "I_other" } } },
        undefined,
        true,
      ),
    ).toEqual({ ok: false, code: "approval-unknown" });
  }
  const v1Digest = await githubEvidenceDigest(
    { parentId: "I_1", body: "Spec", tickets: [] },
    false,
  );
  const v1 = { ...approval, remote: { ...approval.remote, version: 1, digest: v1Digest } };
  expect(await check({ approved: v1 })).toEqual({ ok: true });
  expect(await check({ approved: { ...v1, remote: { ...v1.remote, digest: "old" } } })).toEqual({
    ok: false,
    code: "approval-stale",
  });
  expect(await check({ approved: { ...v1, remote: { ...v1.remote, version: 99 } } })).toEqual({
    ok: false,
    code: "approval-unknown",
  });
  const failed = await setup({ [issue]: { code: 1 } });
  expect(
    await requireCurrentGithubApproval(failed.root, "Example/Project", "I_1", 1, false, [], {
      approved: approval,
    }),
  ).toEqual({ ok: false, code: "detail-unavailable" });
});

test("HTTP approve reopen reapprove retains the reopen and makes approval current", async () => {
  const { root, git, request, reviewedDigest, snapshot } = await setup();
  expect((await request()).status).toBe(200);
  const reopened = await request(
    { stage: "clarify", reviewedDigest, reviewedHead: git("rev-parse", "HEAD") },
    "reopen",
  );
  expect(reopened.status).toBe(200);
  const workItem = indexProject(createMemoryRepoFiles({ ".scratch/github-1/spec.md": "# Spec" }), {
    name: "test",
  }).workItems[0];
  workItem.stage = "clarify";
  workItem.stints = [
    {
      id: "finished",
      workItem: "github-1",
      stage: "clarify",
      ticket: null,
      agent: "codex",
      status: "finished",
      startedAt: "2099-01-01T00:00:00Z",
      endedAt: "2099-01-01T00:01:00Z",
      checkpointCommit: "checkpoint",
      handoff: {
        stint: "finished",
        agent: "codex",
        stoppedAt: "Done",
        unresolved: "None",
        nextStep: "Approve",
      },
    },
  ];
  snapshot.workItems = [workItem];
  const response = await request({
    stage: "clarify",
    reviewedDigest,
    reviewedHead: git("rev-parse", "HEAD"),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ approval: "current" });
  const result = parse(readFileSync(join(root, path), "utf8"));
  expect(result.stages.clarify.reopened).toBeDefined();
  expect(result.stages.clarify.approved.at > result.stages.clarify.reopened.at).toBe(true);
});
