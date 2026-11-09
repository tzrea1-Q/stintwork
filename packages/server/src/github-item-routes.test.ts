// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { Hono } from "hono";
import { afterEach, expect, test, vi } from "vitest";
import { adapterHost, createAgentRegistry, readExecutableIdentity } from "@stintwork/agents";
import { createFakeAgentLauncher, fakeAgentProfiles } from "@stintwork/agents/testing";
import {
  foldStintLog,
  githubEvidenceDigestV2,
  indexProject,
  type StintLogEntry,
} from "@stintwork/core";
import { ensureWorktree, withRepoLock } from "@stintwork/git";
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
import { addShipRoutes } from "./ship.js";
import { addStintRoutes } from "./stints.js";
import { createDetailPublisher } from "./github-tickets.js";
import { requireCurrentGithubApproval } from "./github-gates.js";

const roots: string[] = [];
const oldPath = process.env.PATH;
afterEach(() => {
  process.env.PATH = oldPath;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const workflowPath = ".stintwork/github/example/project/1/workflow.yaml";
async function fixture(shipOnly = false) {
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
    [workflowPath]: `workflow: feature\nstage: ${shipOnly ? "ship" : "review"}\ngithub:\n  host: github.com\n  repositoryId: R_1\n  repository: Example/Project\n  issueId: I_1\n  number: 1\n  url: https://github.com/Example/Project/issues/1\n`,
  })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  if (shipOnly) {
    const path = join(root, ".stintwork/workflows/feature.yaml");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      "id: feature\nname: Feature\ndefaultAgent: codex\nstages: [{id: ship, name: Ship, column: ship, skill: null, gate: merge}]\n",
    );
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
  const getSnapshot = () => {
    const snapshot = indexProject(githubSnapshotFiles(project(), github), { name: "test", github });
    if (shipOnly)
      snapshot.workflows.feature = {
        ...snapshot.workflows.feature,
        stages: snapshot.workflows.feature.stages.filter((stage) => stage.id === "ship"),
      };
    return snapshot;
  };
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
  const source = {
    getGithub: () => github,
    getSnapshot,
    refresh,
    discoveryFailed: () => !!github.discoveryFailed,
    verifyIdentity: async () => true,
    beginDetail: createDetailPublisher(),
    detailFailed: () => {},
    registerDetailIdentities: () => {},
  };
  addShipRoutes(
    app,
    root,
    project,
    refresh,
    () => false,
    writing,
    () => false,
    (_project, snapshot) => {
      for (const item of snapshot.workItems) item.riskyPaths = [];
    },
    source,
  );
  const post = (url: string, body: unknown) =>
    app.request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    root,
    worktree,
    git,
    app,
    post,
    getSnapshot,
    github,
    project,
    refresh,
    source,
    registry,
    gh,
  };
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

test("write routes reproject committed workflow changes without a refresh", async () => {
  const { root, worktree, git, project, getSnapshot, source, registry, github } = await fixture();
  const path = join(worktree, workflowPath);
  writeFileSync(path, readFileSync(path, "utf8").replace("stage: review", "stage: ship"));
  git(worktree, "add", workflowPath);
  git(worktree, "commit", "-qm", "reach ship");
  const cached = getSnapshot();
  expect(cached.workItems[0].stage).toBe("ship");
  writeFileSync(path, readFileSync(path, "utf8").replace("stage: ship", "stage: review"));
  git(worktree, "add", workflowPath);
  git(worktree, "commit", "-qm", "reopen review");
  const head = git(root, "rev-parse", "HEAD");
  const app = new Hono();
  const getCached = () => cached;
  addShipRoutes(
    app,
    root,
    project,
    () => {},
    () => false,
    new Set(),
    () => false,
    (_project, snapshot) => {
      for (const item of snapshot.workItems) item.riskyPaths = [];
    },
    { ...source, getSnapshot: getCached },
  );
  addStageAgentRoute(
    app,
    project,
    root,
    registry,
    () => {},
    () => false,
    new Set(),
    getCached,
    () => github,
  );
  const post = (url: string, body: unknown) =>
    app.request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  let response = await post("/api/work-items/github-1/ship/merge-local", {});
  expect(response.status).toBe(409);
  expect((await response.json()).reasonMessage.code).toBe("ship.stageRequired");
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
  writeFileSync(path, readFileSync(path, "utf8").replace("stage: review", "stage: invalid"));
  git(worktree, "add", workflowPath);
  git(worktree, "commit", "-qm", "invalid workflow");
  response = await post("/api/work-items/github-1/stages/review/agent", { agent: "codex" });
  expect(response.status).toBe(409);
  expect((await response.json()).reasonMessage.code).toBe("agent.validWorkflowRequired");
});

test("GitHub item routes resolve the discovered item and persist its stage agent", async () => {
  const { app, post, worktree } = await fixture();
  let response = await post("/api/work-items/github-1/stages/review/agent", { agent: "codex" });
  expect(response.status, await response.text()).toBe(200);
  expect(readFileSync(join(worktree, workflowPath), "utf8")).toContain("agent: codex");
  response = await app.request("/api/work-items/github-1/diff");
  expect(response.status, await response.text()).toBe(200);
  response = await app.request("/api/work-items/github-1/checks");
  expect(response.status, await response.text()).toBe(200);
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

test.each(["read-only", "stale"] as const)(
  "ship resolves a GitHub item and refuses %s data",
  async (state) => {
    const { post, github } = await fixture();
    if (state === "read-only") github.discoveryFailed = true;
    else
      github.items[0].detail = {
        fetchedAt: "2026-01-01T00:00:00Z",
        stale: true,
        spec: "",
        comments: [],
        tickets: [],
        complete: true,
        warnings: [],
      };
    const response = await post("/api/work-items/github-1/ship/pr-checks", {});
    expect(response.status).toBe(409);
    expect((await response.json()).reasonMessage.code).toBe("gate.detailUnavailable");
  },
);

test("a GitHub item can ship and records its merge in the GitHub workflow", async () => {
  const { root, worktree, git, post } = await fixture(true);
  writeFileSync(join(worktree, "change.txt"), "done\n");
  git(worktree, "add", "change.txt");
  git(worktree, "commit", "-qm", "work");
  const response = await post("/api/work-items/github-1/ship/merge-local", {});
  expect(response.status, await response.text()).toBe(200);
  expect(readFileSync(join(root, workflowPath), "utf8")).toContain("merged:");
});

test("ship revalidates the workflow after waiting for the repository lock", async () => {
  const { root, worktree, post, source } = await fixture(true);
  let release!: () => void;
  let locked!: () => void;
  const acquired = new Promise<void>((resolve) => (locked = resolve));
  const hold = withRepoLock(root, async () => {
    locked();
    await new Promise<void>((resolve) => (release = resolve));
  });
  await acquired;
  let verified!: () => void;
  const checked = new Promise<void>((resolve) => (verified = resolve));
  vi.spyOn(source, "verifyIdentity").mockImplementation(async () => {
    verified();
    return true;
  });
  const request = post("/api/work-items/github-1/ship/merge-local", {});
  await checked;
  const path = join(worktree, workflowPath);
  writeFileSync(path, readFileSync(path, "utf8").replace("stage: ship", "stage: review"));
  release();
  await hold;
  const response = await request;
  expect(response.status).toBe(409);
  expect(readFileSync(join(root, workflowPath), "utf8")).not.toContain("merged:");
});

test("send-back reopens Implement despite stale GitHub approval; merge refuses it", async () => {
  const { root, worktree, git, post, gh } = await fixture();
  const digest = await githubEvidenceDigestV2(
    { parentId: "I_1", body: "Original spec", tickets: [] },
    false,
    [],
  );
  const record = readFileSync(join(worktree, workflowPath), "utf8").replace(
    "stage: review",
    "stage: ship",
  );
  writeFileSync(
    join(worktree, workflowPath),
    `${record}stages:\n  clarify:\n    approved: { by: Developer, at: '2026-10-10T10:00:00Z', remote: { version: 2, parentId: I_1, digest: '${digest}' } }\n`,
  );
  writeFileSync(join(worktree, "conflict.txt"), "worktree\n");
  git(worktree, "add", ".");
  git(worktree, "commit", "-qm", "work");
  writeFileSync(join(root, "conflict.txt"), "main\n");
  git(root, "add", "conflict.txt");
  git(root, "commit", "-qm", "conflict");
  await gh.script({
    "api repos/Example/Project/issues/1": {
      stdout: {
        node_id: "I_1",
        number: 1,
        title: "Parent",
        body: "Changed spec",
        html_url: "https://github.com/Example/Project/issues/1",
        repository_url: "https://api.github.com/repos/Example/Project",
        state: "open",
        state_reason: null,
        labels: [],
        comments: 0,
        sub_issues_summary: { total: 0 },
      },
    },
    "api repos/Example/Project/issues/1/sub_issues?per_page=100&page=1": {
      stdout: [],
      effect: `fs.writeFileSync(${JSON.stringify(join(root, "children-started"))}, ""); const until = Date.now() + 3000; while (!fs.existsSync(${JSON.stringify(join(root, "comments-started"))}) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); if (!fs.existsSync(${JSON.stringify(join(root, "comments-started"))})) throw Error("reads did not overlap");`,
    },
    "api repos/Example/Project/issues/1/comments?per_page=100&page=1": {
      stdout: [],
      effect: `fs.writeFileSync(${JSON.stringify(join(root, "comments-started"))}, "");`,
    },
  });
  expect(
    await requireCurrentGithubApproval(worktree, "Example/Project", "I_1", 1, false, [], {
      approved: { remote: { version: 2, parentId: "I_1", digest } },
    }),
  ).toEqual({ ok: false, code: "approval-stale" });
  rmSync(join(root, "children-started"));
  rmSync(join(root, "comments-started"));
  const beforeMerge = (await gh.calls()).length;
  const merge = await post("/api/work-items/github-1/ship/merge-local", {});
  expect(merge.status).toBe(409);
  expect((await merge.json()).reasonMessage.code).toBe("gate.evidenceChanged");
  const reads = (await gh.calls()).slice(beforeMerge).filter(({ args }) => args[0] === "api");
  expect(reads.filter(({ args }) => args[1] === "repos/Example/Project/issues/1")).toHaveLength(1);
  expect(existsSync(join(root, "comments-started"))).toBe(true);
  const sent = await post("/api/work-items/github-1/ship/send-back", {});
  expect(sent.status, await sent.text()).toBe(200);
  expect(readFileSync(join(worktree, workflowPath), "utf8")).toContain("stage: implement");
});

test("GitHub recovery finds the item and finalises its stint", async () => {
  const { root, worktree, git, project, refresh, source, registry } = await fixture();
  const base = git(worktree, "rev-parse", "HEAD");
  const entry: StintLogEntry = {
    type: "started",
    at: "2026-01-01T00:00:00Z",
    stint: {
      id: "recover-github",
      workItem: "github-1",
      stage: "review",
      ticket: null,
      agent: "codex",
      worktree: { path: worktree, branch: "stintwork/github-1" },
      baseCommit: base,
      brief: { prompt: "", skill: null, lastHandoff: null, changedPaths: [], pointers: [] },
    },
  };
  const path = ".stintwork/local/stints/recover-github.jsonl";
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), `${JSON.stringify(entry)}\n`);
  const stint = foldStintLog([entry]);
  if (!stint) throw new Error("Stint log did not fold");
  stint.recovery = { version: 1, progress: { phase: "finalization", status: "finished" } };
  const stop = addStintRoutes(
    new Hono(),
    root,
    project,
    { agentRegistry: registry },
    () => {},
    refresh,
    undefined,
    undefined,
    undefined,
    source,
  );
  const warnings: string[] = [];
  stop.recover(stint, [entry], (warning) => warnings.push(warning.message), true, path);
  try {
    await expect
      .poll(() => readFileSync(join(root, path), "utf8"), { timeout: 15000 })
      .toContain('"type":"ended"');
    const entries = readFileSync(join(root, path), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries.find((event) => event.type === "ended")).toMatchObject({ status: "finished" });
    expect(warnings).toEqual([]);
  } finally {
    await stop();
  }
});

test("GitHub pull request ship records the merged workflow", async () => {
  const { root, worktree, git, post, gh } = await fixture(true);
  const bare = `${root}-remote.git`;
  roots.push(bare);
  git(root, "clone", "--quiet", "--bare", root, bare);
  git(root, "remote", "add", "origin", bare);
  writeFileSync(join(worktree, "change.txt"), "done\n");
  git(worktree, "add", "change.txt");
  git(worktree, "commit", "-qm", "work");
  const reviewed = git(worktree, "rev-parse", "HEAD");
  writeFileSync(
    join(worktree, workflowPath),
    `${readFileSync(join(worktree, workflowPath), "utf8")}stages:\n  review:\n    approved: { by: Developer, at: '2026-10-10T10:00:00Z', commit: ${reviewed} }\n`,
  );
  git(worktree, "add", workflowPath);
  git(worktree, "commit", "-qm", "approve");
  const head = git(worktree, "rev-parse", "HEAD");
  const view = {
    number: 12,
    url: "https://github.com/Example/Project/pull/12",
    state: "OPEN",
    headRefOid: head,
    headRefName: "stintwork/github-1",
    baseRefName: "main",
    mergeCommit: null,
    mergedAt: null,
    isCrossRepository: false,
    title: "Existing title",
  };
  const repo = {
    stdout: {
      defaultBranchRef: { name: "main" },
      nameWithOwner: "Example/Project",
      url: "https://github.com/Example/Project",
      mergeCommitAllowed: true,
    },
  };
  for (const [defaultBranch, warning] of [
    ["main", false],
    ["release", true],
  ] as const) {
    await gh.script({
      "repo view": { stdout: { ...repo.stdout, defaultBranchRef: { name: defaultBranch } } },
      "pr view": { stdout: { ...view, body: "Existing body" } },
    });
    const response = await post("/api/work-items/github-1/ship/preview-pr", {});
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await response.json()).preview).toMatchObject({
      title: "Existing title",
      body: "Existing body",
      base: "main",
      existingPrNumber: 12,
      existingPrUrl: view.url,
      parentNumber: 1,
      parentWillNotClose: warning,
    });
  }
  for (const [defaultBranch, warning] of [
    ["main", false],
    ["release", true],
  ] as const) {
    await gh.script({
      "repo view": { stdout: { ...repo.stdout, defaultBranchRef: { name: defaultBranch } } },
      "pr view": { code: 1, stdout: "no pull requests found for branch" },
    });
    const response = await post("/api/work-items/github-1/ship/preview-pr", {});
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await response.json()).preview).toMatchObject({
      base: "main",
      parentWillNotClose: warning,
      body: expect.stringContaining("Closes #1"),
    });
  }
  await gh.script({
    "repo view": {
      stdout: {
        nameWithOwner: "Example/Project",
        url: "https://github.com/Example/Project",
        mergeCommitAllowed: true,
        defaultBranchRef: { name: "main" },
      },
    },
    "api repos/Example/Project/branches/main/protection": {
      stdout: { required_linear_history: { enabled: false } },
    },
    "pr view": [
      { code: 1, stdout: "no pull requests found for branch" },
      { code: 1, stdout: "no pull requests found for branch" },
      { stdout: view },
    ],
    "pr create": { stdout: view.url },
    "pr checks": { stdout: [{ name: "CI", bucket: "pass", link: "" }] },
    "pr merge": {
      effect: `execFileSync('git', ['update-ref', 'refs/heads/main', ${JSON.stringify(head)}], {cwd: ${JSON.stringify(bare)}}); const replies = JSON.parse(fs.readFileSync(script, 'utf8')); const view = Array.isArray(replies['pr view']) ? replies['pr view'].at(-1) : replies['pr view']; view.stdout.state = 'MERGED'; view.stdout.mergeCommit = {oid: ${JSON.stringify(head)}}; view.stdout.mergedAt = '2026-10-10T10:10:00Z'; fs.writeFileSync(script, JSON.stringify(replies));`,
    },
  });
  let response = await post("/api/work-items/github-1/ship/preview-pr", {});
  expect(response.status, await response.clone().text()).toBe(200);
  const preview = (await response.json()).preview;
  expect(preview.body).toContain("Closes #1");
  const confirmation = preview.confirmation;
  response = await post("/api/work-items/github-1/ship/open-pr", { confirmation });
  expect(response.status, await response.clone().text()).toBe(200);
  expect(
    (await gh.calls()).find(({ args }) => args[0] === "pr" && args[1] === "create")?.args,
  ).toContain(preview.body);
  response = await post("/api/work-items/github-1/ship/merge-pr", {});
  expect(response.status, await response.clone().text()).toBe(200);
  expect(readFileSync(join(root, workflowPath), "utf8")).toContain("merged:");
});

test("GitHub pull request ship retries cleanup after recording the merge", async () => {
  const { root, worktree, git, post, gh } = await fixture(true);
  const bare = `${root}-remote.git`;
  roots.push(bare);
  git(root, "clone", "--quiet", "--bare", root, bare);
  git(root, "remote", "add", "origin", bare);
  writeFileSync(join(worktree, "change.txt"), "done\n");
  git(worktree, "add", "change.txt");
  git(worktree, "commit", "-qm", "work");
  const reviewed = git(worktree, "rev-parse", "HEAD");
  writeFileSync(
    join(worktree, workflowPath),
    `${readFileSync(join(worktree, workflowPath), "utf8")}stages:\n  review:\n    approved: { by: Developer, at: '2026-10-10T10:00:00Z', commit: ${reviewed} }\n`,
  );
  git(worktree, "add", workflowPath);
  git(worktree, "commit", "-qm", "approve");
  const head = git(worktree, "rev-parse", "HEAD");
  const view = {
    number: 12,
    url: "https://github.com/Example/Project/pull/12",
    state: "OPEN",
    headRefOid: head,
    headRefName: "stintwork/github-1",
    baseRefName: "main",
    mergeCommit: null,
    mergedAt: null,
    isCrossRepository: false,
  };
  await gh.script({
    "repo view": {
      stdout: {
        nameWithOwner: "Example/Project",
        url: "https://github.com/Example/Project",
        mergeCommitAllowed: true,
        defaultBranchRef: { name: "main" },
      },
    },
    "api repos/Example/Project/branches/main/protection": {
      stdout: { required_linear_history: { enabled: false } },
    },
    "pr view": [
      { code: 1, stdout: "no pull requests found for branch" },
      { code: 1, stdout: "no pull requests found for branch" },
      { stdout: view },
    ],
    "pr create": { stdout: view.url },
    "pr checks": { stdout: [{ name: "CI", bucket: "pass", link: "" }] },
    "pr merge": {
      effect: `execFileSync('git', ['update-ref', 'refs/heads/main', ${JSON.stringify(head)}], {cwd: ${JSON.stringify(bare)}}); const replies = JSON.parse(fs.readFileSync(script, 'utf8')); const view = Array.isArray(replies['pr view']) ? replies['pr view'].at(-1) : replies['pr view']; view.stdout.state = 'MERGED'; view.stdout.mergeCommit = {oid: ${JSON.stringify(head)}}; view.stdout.mergedAt = '2026-10-10T10:10:00Z'; fs.writeFileSync(script, JSON.stringify(replies));`,
    },
  });
  let response = await post("/api/work-items/github-1/ship/preview-pr", {});
  expect(response.status, await response.clone().text()).toBe(200);
  const confirmation = (await response.json()).preview.confirmation;
  response = await post("/api/work-items/github-1/ship/open-pr", { confirmation });
  expect(response.status, await response.clone().text()).toBe(200);
  git(root, "worktree", "lock", worktree);
  response = await post("/api/work-items/github-1/ship/merge-pr", {});
  expect(response.status).toBe(409);
  expect(await response.clone().text()).toContain("cleanup failed");
  expect(readFileSync(join(root, workflowPath), "utf8")).toContain("merged:");
  const before = await gh.calls();
  git(root, "worktree", "unlock", worktree);
  response = await post("/api/work-items/github-1/ship/merge-pr", {});
  expect(response.status, await response.clone().text()).toBe(200);
  expect(
    (await gh.calls())
      .slice(before.length)
      .filter(({ args }) => args[0] === "pr" && ["checks", "merge"].includes(args[1])),
  ).toEqual([]);
  expect(readFileSync(join(root, workflowPath), "utf8")).toContain("merged:");
});

test("ship accepts a later worktree workflow", async () => {
  const { root, worktree, git, post } = await fixture(true);
  const record = readFileSync(join(worktree, workflowPath), "utf8");
  writeFileSync(
    join(worktree, workflowPath),
    `${record}stages:\n  review:\n    approved: { by: Developer, at: '2026-10-10T10:00:00Z' }\n`,
  );
  git(worktree, "add", workflowPath);
  git(worktree, "commit", "-qm", "approve review");
  writeFileSync(join(root, workflowPath), record.replace("stage: ship", "stage: review"));
  const response = await post("/api/work-items/github-1/ship/pr-checks", {});
  expect(response.status).toBe(409);
  expect((await response.json()).reasonMessage.code).toBe("ship.prMissing");
});

test("ship refuses an invalid worktree workflow", async () => {
  const { worktree, post } = await fixture(true);
  writeFileSync(join(worktree, workflowPath), "workflow: [invalid\n");
  const response = await post("/api/work-items/github-1/ship/merge-local", {});
  expect(response.status).toBe(409);
});

test.each(["waiting", "stopped", "finalizing"] as const)(
  "startup recovery remains available while discovery hangs (%s)",
  async (mode) => {
    const { root, worktree, git, gh, registry } = await fixture();
    git(root, "remote", "add", "origin", "https://github.com/Example/Project.git");
    mkdirSync(join(root, "web"));
    writeFileSync(join(root, "web/index.html"), "<!doctype html>");
    const path = join(root, ".stintwork/local/stints/hanging.jsonl");
    mkdirSync(dirname(path), { recursive: true });
    const started: StintLogEntry = {
      type: "started",
      at: "2026-01-01T00:00:00Z",
      stint: {
        id: "hanging",
        workItem: "github-1",
        stage: "review",
        ticket: 2,
        agent: "codex",
        worktree: { path: worktree, branch: "stintwork/github-1" },
        baseCommit: git(worktree, "rev-parse", "HEAD"),
        brief: { prompt: "", skill: null, lastHandoff: null, changedPaths: [], pointers: [] },
      },
    };
    const stop: StintLogEntry = {
      type: "recovery",
      version: 1,
      at: started.at,
      kind: "stop_requested",
    };
    const attempt: StintLogEntry = {
      type: "recovery",
      version: 1,
      at: started.at,
      kind: "attempt",
      attempt: {
        id: "a",
        owner: { pid: process.pid, startedAt: started.at },
        pid: process.pid,
        marker: "test",
      },
    };
    const phase: StintLogEntry = {
      type: "recovery",
      version: 1,
      at: started.at,
      kind: "phase",
      attemptId: "a",
      progress: { phase: "finalization", status: "finished" },
    };
    const suspended: StintLogEntry = {
      type: "recovery",
      version: 1,
      at: started.at,
      kind: "resume",
      state: "suspended",
    };
    const entries =
      mode === "stopped"
        ? [started, stop]
        : mode === "finalizing"
          ? [started, attempt, phase, suspended]
          : [started];
    writeFileSync(path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    await gh.script({
      "auth status": {
        effect: "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000)",
      },
    });
    const { createProjectServer } = await import("./index.js");
    const server = createProjectServer(root, join(root, "web"), { agentRegistry: registry });
    try {
      void server.app.request("/api/project");
      if (mode === "waiting") {
        const response = await Promise.race([
          server.app.request("/api/stints/hanging/stop", { method: "POST" }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("stop blocked")), 2000),
          ),
        ]);
        expect(response.status).toBe(202);
      }
      await expect
        .poll(() => readFileSync(path, "utf8"), { timeout: 5000 })
        .toContain(mode === "finalizing" ? '"type":"ended"' : '"status":"stopped"');
      if (mode === "waiting") {
        await expect
          .poll(
            async () =>
              (await server.app.request("/api/stints/hanging/stop", { method: "POST" })).status,
          )
          .toBe(409);
      }
    } finally {
      await server.stop();
    }
  },
);

test.each(["success", "retry", "offline", "stop", "incomplete", "identity", "pending"] as const)(
  "ticket-bound GitHub recovery waits for detail (%s)",
  async (mode) => {
    const fails = mode === "retry" || mode === "stop";
    const timers = vi.spyOn(globalThis, "setTimeout");
    const cleared = vi.spyOn(globalThis, "clearTimeout");
    const { root, worktree, git, gh, registry } = await fixture();
    git(root, "remote", "add", "origin", "https://github.com/Example/Project.git");
    mkdirSync(join(root, "web"));
    writeFileSync(join(root, "web/index.html"), "<!doctype html>");
    const base = git(worktree, "rev-parse", "HEAD");
    const path = join(root, ".stintwork/local/stints/restart.jsonl");
    mkdirSync(dirname(path), { recursive: true });
    const selected = {
      agent: "codex" as const,
      source: "installed" as const,
      reason: "compatible" as const,
      executable: {
        path: process.execPath,
        version: "1",
        identity: readExecutableIdentity(process.execPath)?.identity ?? "fixture",
      },
      adapterEntry: "/fake/adapter.js",
      adapterVersion: "1",
      cacheKey: "a".repeat(64),
      lockDigest: "b".repeat(64),
    };
    const agent = registry.get("codex")!;
    agent.verifyRecovery = async () => selected;
    const launchAgent = vi.fn<typeof agent.launch>(() => {
      let finish: () => void = () => {};
      return {
        ready: Promise.resolve(),
        done: new Promise((resolve) => {
          finish = () => resolve({ stopReason: "cancelled" });
        }),
        cancel: async () => finish(),
      };
    });
    agent.launch = launchAgent;
    const entry: StintLogEntry = {
      type: "started",
      at: "2026-01-01T00:00:00Z",
      stint: {
        id: "restart",
        workItem: "github-1",
        stage: "review",
        ticket: 2,
        agent: "codex",
        worktree: { path: worktree, branch: "stintwork/github-1" },
        baseCommit: base,
        brief: { prompt: "", skill: null, lastHandoff: null, changedPaths: [], pointers: [] },
      },
    };
    const phase: StintLogEntry = {
      type: "recovery",
      version: 1,
      at: "2026-01-01T00:00:01Z",
      kind: "phase",
      attemptId: "attempt-1",
      progress: { phase: "findings" },
    };
    const attempt: StintLogEntry = {
      type: "recovery",
      version: 1,
      at: entry.at,
      kind: "attempt",
      attempt: {
        id: "attempt-1",
        owner: { pid: process.pid, startedAt: entry.at },
        pid: process.pid,
        marker: "stintwork-attempt-1",
      },
    };
    const suspended: StintLogEntry = {
      type: "recovery",
      version: 1,
      at: entry.at,
      kind: "resume",
      state: "suspended",
    };
    writeFileSync(
      path,
      [
        entry,
        {
          type: "recovery",
          version: 1,
          at: entry.at,
          kind: "launch",
          launch: { ...selected, host: adapterHost(), permissionLevel: "ask" },
        },
        attempt,
        {
          type: "recovery",
          version: 1,
          at: entry.at,
          kind: "session",
          attemptId: "attempt-1",
          sessionId: "fake-session",
        },
        phase,
        suspended,
      ]
        .map((value) => JSON.stringify(value))
        .join("\n") + "\n",
    );
    const connection = (nodes: unknown[]) => ({
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
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
      sub_issues_summary: { total: mode === "incomplete" ? 2 : 1 },
    };
    const child = {
      ...parent,
      node_id: "I_2",
      number: 2,
      title: "Ticket",
      html_url: "https://github.com/Example/Project/issues/2",
      sub_issues_summary: { total: 0 },
      issue_dependencies_summary: { total_blocked_by: 0 },
    };
    const replies = {
      "auth status": {},
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
                  labels: connection([]),
                  subIssues: {
                    ...connection([{ repository: { id: "R_1" }, subIssues: { totalCount: 0 } }]),
                    totalCount: 1,
                  },
                },
              ]),
            },
            rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-10-28T00:00:00Z" },
          },
        },
      },
      "api repos/Example/Project/issues/1": { stdout: parent },
      "api repos/Example/Project/issues/1/sub_issues?per_page=100&page=1": fails
        ? { code: 1, stdout: "network offline" }
        : { stdout: [child] },
      "api repos/Example/Project/issues/1/comments?per_page=100&page=1": { stdout: [] },
      "api repos/Example/Project/issues/2/labels?per_page=100&page=1": { stdout: [] },
      "api repos/Example/Project/issues/2/comments?per_page=100&page=1": { stdout: [] },
      "api repos/Example/Project/issues/2/dependencies/blocked_by?per_page=100&page=1": {
        stdout: [],
      },
    };
    const release = join(root, "release-recovery-detail");
    const started = join(root, "started-recovery-detail");
    if (mode === "pending")
      replies["api repos/Example/Project/issues/1"] = {
        stdout: parent,
        effect: `fs.writeFileSync(${JSON.stringify(started)}, ""); while (!fs.existsSync(${JSON.stringify(release)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);`,
      } as (typeof replies)["api repos/Example/Project/issues/1"];
    await gh.script(replies);
    if (mode === "identity")
      await gh.script({
        ...replies,
        "api repos/Example/Project": [
          replies["api repos/Example/Project"],
          {
            stdout: {
              node_id: "R_other",
              full_name: "Example/Project",
              html_url: "https://github.com/Example/Project",
            },
          },
        ],
      });
    if (mode === "offline")
      await gh.script({ ...replies, "api graphql": { code: 1, stdout: "network offline" } });
    const { createProjectServer } = await import("./index.js");
    const server = createProjectServer(root, join(root, "web"), { agentRegistry: registry });
    try {
      await server.app.request("/api/project");
      if (mode === "pending") {
        await expect.poll(() => existsSync(started)).toBe(true);
        expect((await server.app.request("/api/health")).status).toBe(200);
        writeFileSync(release, "");
      }
      if (fails || mode === "offline" || mode === "incomplete" || mode === "identity") {
        expect(readFileSync(path, "utf8")).not.toContain('"state":"fallback"');
        expect(readFileSync(path, "utf8")).not.toContain('"state":"resuming"');
        const post = (url: string, body: unknown) =>
          server.app.request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
        if (mode === "identity") {
          const project = await (await server.app.request("/api/project")).json();
          expect(
            project.workItems.find((item: { slug: string }) => item.slug === "github-1")
              ?.activeStint?.id,
          ).toBe("restart");
          expect(
            project.warnings.some(
              (warning: { messageMessage?: { code: string } }) =>
                warning.messageMessage?.code === "recovery.blocked",
            ),
          ).toBe(true);
        }
        if (mode === "stop") {
          for (const [url, body, code] of [
            ["/api/stints", { workItem: "github-1", agent: "codex" }, "stint.alreadyActive"],
            [
              "/api/work-items/github-1/stages/review/agent",
              { agent: "codex" },
              "agent.activeWrite",
            ],
            ["/api/work-items/github-1/ship/pr-checks", {}, "ship.running"],
          ] as const) {
            const response = await post(url, body);
            expect(response.status).toBe(409);
            expect((await response.json()).reasonMessage.code).toBe(code);
          }
          const retryTimer = () =>
            timers.mock.results[timers.mock.calls.findIndex((call) => call[1] === 5000)]?.value;
          await expect.poll(retryTimer).toBeDefined();
          const retry = retryTimer();
          expect(retry).toBeDefined();
          expect((await post("/api/stints/restart/stop", {})).status).toBe(202);
          await expect
            .poll(() => readFileSync(path, "utf8"), { timeout: 15000 })
            .toContain('"status":"stopped"');
          await expect
            .poll(async () => {
              const afterStop = await post("/api/stints", { workItem: "github-1", agent: "codex" });
              return (await afterStop.json()).reasonMessage?.code;
            })
            .not.toBe("stint.alreadyActive");
          expect(cleared).toHaveBeenCalledWith(retry);
          return;
        }
        if (fails)
          replies["api repos/Example/Project/issues/1/sub_issues?per_page=100&page=1"] = {
            stdout: [child],
          };
        parent.sub_issues_summary.total = 1;
        await gh.script(replies);
        if (mode === "identity")
          await expect
            .poll(async () => (await post("/api/github/discovery/refresh", {})).status)
            .toBe(200);
      }
      await expect
        .poll(() => readFileSync(path, "utf8"), { timeout: 15000 })
        .toContain('"state":"resuming"');
      await expect.poll(() => launchAgent.mock.calls.length, { timeout: 15000 }).toBe(1);
      expect(readFileSync(path, "utf8")).not.toContain('"state":"fallback"');
      if (mode === "identity") {
        await expect
          .poll(async () => {
            const project = await (await server.app.request("/api/project")).json();
            return project.warnings.some(
              (warning: { messageMessage?: { code: string } }) =>
                warning.messageMessage?.code === "recovery.blocked",
            );
          })
          .toBe(false);
      }
    } finally {
      writeFileSync(release, "");
      await server.stop();
      timers.mockRestore();
      cleared.mockRestore();
    }
  },
);

test("repository replacement invalidates all cached items until discovery succeeds", async () => {
  const { root, git, gh, registry } = await fixture();
  git(root, "remote", "add", "origin", "https://github.com/Example/Project.git");
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web/index.html"), "<!doctype html>");
  const connection = (nodes: unknown[]) => ({
    nodes,
    pageInfo: { hasNextPage: false, endCursor: null },
  });
  const replies = (id: string) => ({
    "auth status": {},
    "api user": { stdout: { id: 101, login: "101" } },
    "api repos/Example/Project": {
      stdout: {
        node_id: id,
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": {
      stdout: {
        data: {
          repository: {
            id,
            nameWithOwner: "Example/Project",
            issues: connection(
              [1, 3].map((number) => ({
                id: `I_${number}`,
                number,
                title: `Item ${number}`,
                url: `https://github.com/Example/Project/issues/${number}`,
                parent: null,
                labels: connection([{ name: "stintwork:work-item" }]),
                subIssues: { ...connection([]), totalCount: 0 },
              })),
            ),
          },
          rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-10-28T00:00:00Z" },
        },
      },
    },
  });
  await gh.script(replies("R_1"));
  const { createProjectServer } = await import("./index.js");
  const server = createProjectServer(root, join(root, "web"), { agentRegistry: registry });
  const post = (url: string, body: unknown) =>
    server.app.request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    expect((await (await server.app.request("/api/project")).json()).workItems).toHaveLength(2);
    await gh.script(replies("R_new"));
    const failed = await post("/api/github/items/1/refresh", {});
    expect(failed.status).toBe(503);
    expect((await failed.json()).workItems).toEqual([]);
    for (const [url, body] of [
      [
        "/api/github/items/3/gates/approve",
        { stage: "spec", reviewedDigest: "x", reviewedHead: "x" },
      ],
      ["/api/stints", { workItem: "github-3", agent: "codex" }],
      ["/api/work-items/github-3/stages/review/agent", { agent: "codex" }],
      ["/api/work-items/github-3/ship/pr-checks", {}],
    ] as const) {
      const response = await post(url, body);
      expect(response.status).toBe(409);
      expect((await response.json()).reasonMessage.code).toBe("gate.identityAmbiguous");
    }
    const refreshed = await post("/api/github/discovery/refresh", {});
    expect(refreshed.status).toBe(200);
    expect((await refreshed.json()).workItems).toHaveLength(2);
  } finally {
    await server.stop();
  }
});

test.each(["page-two", "absent"] as const)(
  "ticket-bound GitHub recovery advances discovery (%s)",
  async (mode) => {
    const fails = false;
    const timers = vi.spyOn(globalThis, "setTimeout");
    const cleared = vi.spyOn(globalThis, "clearTimeout");
    const { root, worktree, git, gh, registry } = await fixture();
    git(root, "remote", "add", "origin", "https://github.com/Example/Project.git");
    if (mode === "absent") rmSync(join(root, workflowPath));
    mkdirSync(join(root, "web"));
    writeFileSync(join(root, "web/index.html"), "<!doctype html>");
    const base = git(worktree, "rev-parse", "HEAD");
    const path = join(root, ".stintwork/local/stints/restart.jsonl");
    mkdirSync(dirname(path), { recursive: true });
    const selected = {
      agent: "codex" as const,
      source: "installed" as const,
      reason: "compatible" as const,
      executable: {
        path: process.execPath,
        version: "1",
        identity: readExecutableIdentity(process.execPath)?.identity ?? "fixture",
      },
      adapterEntry: "/fake/adapter.js",
      adapterVersion: "1",
      cacheKey: "a".repeat(64),
      lockDigest: "b".repeat(64),
    };
    const agent = registry.get("codex");
    if (!agent) throw new Error("Missing Codex agent");
    agent.verifyRecovery = async () => selected;
    const launchAgent = vi.fn<typeof agent.launch>(() => {
      let finish: () => void = () => {};
      return {
        ready: Promise.resolve(),
        done: new Promise((resolve) => {
          finish = () => resolve({ stopReason: "cancelled" });
        }),
        cancel: async () => finish(),
      };
    });
    agent.launch = launchAgent;
    const entry: StintLogEntry = {
      type: "started",
      at: "2026-01-01T00:00:00Z",
      stint: {
        id: "restart",
        workItem: "github-1",
        stage: "review",
        ticket: 2,
        agent: "codex",
        worktree: { path: worktree, branch: "stintwork/github-1" },
        baseCommit: base,
        brief: { prompt: "", skill: null, lastHandoff: null, changedPaths: [], pointers: [] },
      },
    };
    const phase: StintLogEntry = {
      type: "recovery",
      version: 1,
      at: "2026-01-01T00:00:01Z",
      kind: "phase",
      attemptId: "attempt-1",
      progress: { phase: "findings" },
    };
    const attempt: StintLogEntry = {
      type: "recovery",
      version: 1,
      at: entry.at,
      kind: "attempt",
      attempt: {
        id: "attempt-1",
        owner: { pid: process.pid, startedAt: entry.at },
        pid: process.pid,
        marker: "stintwork-attempt-1",
      },
    };
    const suspended: StintLogEntry = {
      type: "recovery",
      version: 1,
      at: entry.at,
      kind: "resume",
      state: "suspended",
    };
    writeFileSync(
      path,
      [
        entry,
        {
          type: "recovery",
          version: 1,
          at: entry.at,
          kind: "launch",
          launch: { ...selected, host: adapterHost(), permissionLevel: "ask" },
        },
        attempt,
        {
          type: "recovery",
          version: 1,
          at: entry.at,
          kind: "session",
          attemptId: "attempt-1",
          sessionId: "fake-session",
        },
        phase,
        suspended,
      ]
        .map((value) => JSON.stringify(value))
        .join("\n") + "\n",
    );
    const connection = (nodes: unknown[]) => ({
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null as string | null },
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
      sub_issues_summary: { total: 1 },
    };
    const child = {
      ...parent,
      node_id: "I_2",
      number: 2,
      title: "Ticket",
      html_url: "https://github.com/Example/Project/issues/2",
      sub_issues_summary: { total: 0 },
      issue_dependencies_summary: { total_blocked_by: 0 },
    };
    const replies = {
      "auth status": {},
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
                  labels: connection([]),
                  subIssues: {
                    ...connection([{ repository: { id: "R_1" }, subIssues: { totalCount: 0 } }]),
                    totalCount: 1,
                  },
                },
              ]),
            },
            rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-10-28T00:00:00Z" },
          },
        },
      },
      "api repos/Example/Project/issues/1": { stdout: parent },
      "api repos/Example/Project/issues/1/sub_issues?per_page=100&page=1": fails
        ? { code: 1, stdout: "network offline" }
        : { stdout: [child] },
      "api repos/Example/Project/issues/1/comments?per_page=100&page=1": { stdout: [] },
      "api repos/Example/Project/issues/2/labels?per_page=100&page=1": { stdout: [] },
      "api repos/Example/Project/issues/2/comments?per_page=100&page=1": { stdout: [] },
      "api repos/Example/Project/issues/2/dependencies/blocked_by?per_page=100&page=1": {
        stdout: [],
      },
    };
    const page = replies["api graphql"].stdout;
    const pages = Array.from({ length: 5 }, (_, index) => {
      const next = structuredClone(page);
      next.data.repository.issues.nodes = [];
      next.data.repository.issues.pageInfo = { hasNextPage: true, endCursor: `cursor-${index}` };
      return { stdout: next };
    });
    const last = structuredClone(page);
    if (mode === "absent") last.data.repository.issues.nodes = [];
    await gh.script({ ...replies, "api graphql": [...pages, { stdout: last }] });
    const { createProjectServer } = await import("./index.js");
    const server = createProjectServer(root, join(root, "web"), { agentRegistry: registry });
    try {
      await server.app.request("/api/project");
      if (mode === "absent") {
        await expect
          .poll(
            async () => {
              const project = await (await server.app.request("/api/project")).json();
              return project.github?.complete;
            },
            { timeout: 15000 },
          )
          .toBe(true);
        const project = await (await server.app.request("/api/project")).json();
        expect(
          project.warnings.some(
            (warning: { messageMessage?: { code: string } }) =>
              warning.messageMessage?.code === "recovery.blocked",
          ),
        ).toBe(true);
        expect(readFileSync(path, "utf8")).not.toContain('"state":"fallback"');
        expect(launchAgent).not.toHaveBeenCalled();
        const reserved = await server.app.request("/api/stints", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workItem: "github-1", agent: "codex" }),
        });
        expect((await reserved.json()).reasonMessage?.code).toBe("stint.alreadyActive");
        const stop = await server.app.request("/api/stints/restart/stop", { method: "POST" });
        expect(stop.status).toBe(202);
        await expect
          .poll(() => readFileSync(path, "utf8"), { timeout: 15000 })
          .toContain('"status":"stopped"');
        await expect
          .poll(async () => {
            const afterStop = await server.app.request("/api/stints", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ workItem: "github-1", agent: "codex" }),
            });
            return (await afterStop.json()).reasonMessage?.code;
          })
          .not.toBe("stint.alreadyActive");
      } else {
        await expect
          .poll(() => readFileSync(path, "utf8"), { timeout: 15000 })
          .toContain('"state":"resuming"');
        await expect.poll(() => launchAgent.mock.calls.length, { timeout: 15000 }).toBe(1);
        expect(readFileSync(path, "utf8")).not.toContain('"state":"fallback"');
      }
    } finally {
      await server.stop();
      timers.mockRestore();
      cleared.mockRestore();
    }
  },
);

test("a pending PR checks refresh does not hold the Ship write", async () => {
  const { post, source } = await fixture(true);
  let release!: (value: boolean) => void;
  let started!: () => void;
  const checking = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.spyOn(source, "verifyIdentity").mockImplementationOnce(() => {
    started();
    return new Promise<boolean>((resolve) => {
      release = resolve;
    });
  });
  const checks = post("/api/work-items/github-1/ship/pr-checks", {});
  await checking;
  const merge = await post("/api/work-items/github-1/ship/merge-local", {});
  expect((await merge.json()).reasonMessage?.code).not.toBe("ship.activeWrite");
  release(true);
  await checks;
});
