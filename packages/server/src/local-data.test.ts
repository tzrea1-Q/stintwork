// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import {
  gateReadiness,
  parseReviewDecisions,
  type CheckpointWarning,
  type ProjectSnapshot,
  type Stint,
  type StintLogEntry,
} from "@stintwork/core";
import { ensureWorktree, mergeLocalWorkItem } from "@stintwork/git";
import { afterEach, expect, test, vi } from "vitest";
import { createProjectServer } from "./index.js";
import { fetchPullRequestChecks } from "./pull-requests.js";
import { fakeGh } from "../test/fake-gh.js";

const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
}
async function fixture(script: FakeAgentStep[] = [], handoff: FakeAgentStep[] = []) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-local-data-"));
  const root = join(parent, "project");
  git(parent, "init", "--quiet", "--initial-branch=main", root);
  git(root, "config", "user.name", "Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  for (const [path, text] of Object.entries({
    "web/index.html": "<!doctype html><title>Tests</title>",
    ".gitignore": "# Developer's ignore rules\n",
    ".stintwork/config": "checks:\n  - name: test\n    command: node -e 'process.exit(0)'\n",
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md": "# First\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const project = createProjectServer(root, join(root, "web"), {
    launchAgent: createFakeAgentLauncher(script, handoff),
  });
  const tracked = { parent, project };
  fixtures.push(tracked);
  return { parent, root, project, tracked };
}
afterEach(async () => {
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
async function begin(project: ReturnType<typeof createProjectServer>) {
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  return stint;
}
async function ended(
  project: ReturnType<typeof createProjectServer>,
  id: string,
  status = "finished",
) {
  await expect
    .poll(async () => {
      const response = await project.app.request(`/api/stints/${id}`);
      return (await response.json()).stint.status;
    })
    .not.toBe("running");
  const stint = (await (await project.app.request(`/api/stints/${id}`)).json()).stint as Stint;
  expect(stint.status, stint.error).toBe(status);
  return stint;
}
async function start(project: ReturnType<typeof createProjectServer>, status = "finished") {
  return ended(project, (await begin(project)).id, status);
}

async function checks(project: ReturnType<typeof createProjectServer>) {
  expect(
    (await project.app.request("/api/work-items/first/checks", { method: "POST" })).status,
  ).toBe(202);
  await expect
    .poll(
      async () =>
        (await (await project.app.request("/api/work-items/first/checks")).json()).checkExecution,
    )
    .toBeNull();
}

test("an agent's own commit still warns about .env and build output", async () => {
  const { root, project } = await fixture([
    { type: "write", path: ".env", content: "API_TOKEN=dummy\n" },
    { type: "write", path: "dist/bundle.js", content: "generated output\n" },
    { type: "commit", message: "Resolve .scratch/first/issues/01-first.md" },
  ]);
  const stint = await start(project);
  const commit = git(stint.worktree.path, "rev-parse", "HEAD");
  expect(git(stint.worktree.path, "status", "--porcelain")).toBe("");
  expect(stint.checkpointWarnings).toEqual([
    {
      path: ".env",
      reasons: ["likely-secret"],
      excluded: false,
      committed: true,
      commits: [commit],
    },
    {
      path: "dist/bundle.js",
      reasons: ["generated-directory"],
      excluded: false,
      committed: true,
      commits: [commit],
    },
  ]);
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.attentionItems).toContainEqual(
    expect.objectContaining({ kind: "checkpoint-warning" }),
  );
  expect(snapshot.workItems[0].riskyPaths?.map(({ path }) => path)).toEqual([
    ".env",
    "dist/bundle.js",
  ]);
  expect(
    gateReadiness({ ...snapshot.workItems[0], stage: "review" }).conditions.find(
      ({ id }) => id === "risky-paths",
    )?.ready,
  ).toBe(false);
  const diff = await (await project.app.request("/api/work-items/first/diff")).json();
  expect(JSON.stringify(diff)).not.toContain("API_TOKEN=dummy");
  expect(diff.files.find((file: { path: string }) => file.path === ".env")).toMatchObject({
    contentsHidden: true,
    hunks: [],
  });
  const log = await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8");
  expect(log).not.toContain("API_TOKEN=dummy");
  expect(log).toContain('"committed":true');
});

test("each commit is inspected even when a later commit deletes or shrinks a risky path", async () => {
  const { root, project } = await fixture([
    { type: "write", path: ".env", content: "API_TOKEN=dummy\n" },
    { type: "commit", message: "Add risky files" },
    { type: "write", path: ".env", content: "API_TOKEN=another-dummy\n" },
    { type: "write", path: "large.dat", content: "small\n" },
    { type: "commit", message: "Modify risky files" },
  ]);
  const worktree = await ensureWorktree(root, "first");
  await writeFile(join(worktree.path, "large.dat"), "x".repeat(1024 * 1024 + 1));
  const stint = await start(project);
  const commits = git(
    stint.worktree.path,
    "rev-list",
    "--reverse",
    `${stint.baseCommit}..HEAD`,
  ).split("\n");
  expect(stint.checkpointWarnings).toEqual([
    { path: ".env", reasons: ["likely-secret"], excluded: false, committed: true, commits },
    {
      path: "large.dat",
      reasons: ["large-file"],
      excluded: false,
      committed: true,
      commits: [commits[0]],
    },
  ]);
  git(stint.worktree.path, "rm", ".env");
  git(stint.worktree.path, "commit", "--quiet", "-m", "Remove dummy secret");
  await checks(project);
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.workItems[0].riskyPaths).toEqual([]);
  expect(snapshot.attentionItems.some(({ kind }) => kind === "checkpoint-warning")).toBe(false);
  expect(
    (await (await project.app.request(`/api/stints/${stint.id}`)).json()).stint.checkpointWarnings,
  ).toEqual(stint.checkpointWarnings);
});

test("manual commits require per-path, blob-scoped acceptance recorded in review.yaml", async () => {
  const { root, project } = await fixture();
  const stint = await start(project);
  await writeFile(join(stint.worktree.path, ".env.fixture"), "API_TOKEN=dummy\n");
  git(stint.worktree.path, "add", ".env.fixture");
  git(stint.worktree.path, "commit", "--quiet", "-m", "Deliberate fixture by hand");
  await checks(project);
  const read = async () =>
    (await (await project.app.request("/api/project")).json()) as ProjectSnapshot;
  const item = (await read()).workItems[0];
  const risk = item.riskyPaths?.[0];
  expect(risk?.path).toBe(".env.fixture");
  expect((await read()).attentionItems.some(({ kind }) => kind === "checkpoint-warning")).toBe(
    true,
  );
  const accept = (body: object, origin?: string) =>
    project.app.request("/api/work-items/first/risky-paths/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) },
      body: JSON.stringify(body),
    });
  const request = { id: risk?.path, blob: risk?.blob, reason: "Dummy token fixture" };
  expect((await accept({ ...request, reason: " " })).status).toBe(400);
  expect((await accept(request, "http://foreign.invalid")).status).toBe(403);
  expect((await accept({ ...request, blob: "f".repeat(40) })).status).toBe(409);
  const response = await accept(request);
  expect(response.status, await response.clone().text()).toBe(200);
  const { decision } = await response.json();
  expect(decision).toMatchObject({ ...request, kind: "risky-path", status: "accepted" });
  expect(
    parseReviewDecisions(
      await readFile(join(stint.worktree.path, ".scratch/first/review.yaml"), "utf8"),
    ),
  ).toEqual([decision]);
  expect(
    gateReadiness({ ...(await read()).workItems[0], stage: "review" }).conditions.find(
      ({ id }) => id === "risky-paths",
    )?.ready,
  ).toBe(true);
  expect((await read()).attentionItems.some(({ kind }) => kind === "checkpoint-warning")).toBe(
    false,
  );
  await writeFile(join(stint.worktree.path, ".env.fixture"), "API_TOKEN=changed-dummy\n");
  git(stint.worktree.path, "add", ".env.fixture");
  git(stint.worktree.path, "commit", "--quiet", "-m", "Change fixture");
  await checks(project);
  expect((await accept(request)).status).toBe(409);
  expect(
    gateReadiness({ ...(await read()).workItems[0], stage: "review" }).conditions.find(
      ({ id }) => id === "risky-paths",
    )?.ready,
  ).toBe(false);
  expect((await read()).attentionItems.some(({ kind }) => kind === "checkpoint-warning")).toBe(
    true,
  );
  expect(git(root, "status", "--porcelain", "--untracked-files=all")).toBe("");
});

test("check logs ignore themselves before any stint or guided setup", async () => {
  const { root, project } = await fixture();
  await ensureWorktree(root, "first");
  const response = await project.app.request("/api/work-items/first/checks", { method: "POST" });
  expect(response.status).toBe(202);
  await expect
    .poll(
      async () =>
        (await (await project.app.request("/api/work-items/first/checks")).json()).checkExecution,
    )
    .toBeNull();
  expect(git(root, "status", "--porcelain", "--untracked-files=all")).toBe("");
  expect(await readFile(join(root, ".stintwork/local/.gitignore"), "utf8")).toBe("*\n");
  expect(await readFile(join(root, ".gitignore"), "utf8")).toBe("# Developer's ignore rules\n");
});

test("a first stint leaves the main ignore file untouched and can merge without setup", async () => {
  const { root, project } = await fixture([{ type: "write", path: "code.txt", content: "Work\n" }]);
  const stint = await start(project);
  let refusal: unknown;
  try {
    await mergeLocalWorkItem(root, "first", async () => {});
  } catch (error) {
    refusal = error;
  }
  expect
    .soft(await readFile(join(root, ".gitignore"), "utf8"))
    .toBe("# Developer's ignore rules\n");
  expect.soft(refusal).toBeUndefined();
  expect.soft(git(root, "status", "--porcelain", "--untracked-files=all")).toBe("");
  expect(git(root, "show", `${stint.checkpointCommit}:code.txt`)).toBe("Work");
});

test("a checkpoint excludes a stray .env and records a metadata-only warning", async () => {
  const { root, project } = await fixture([
    { type: "write", path: "code.txt", content: "Work\n" },
    { type: "write", path: ".env", content: "PRIVATE_VALUE=not-for-the-branch\n" },
  ]);
  const stint = await start(project);
  expect(git(stint.worktree.path, "ls-tree", "--name-only", "HEAD").split("\n")).not.toContain(
    ".env",
  );
  expect(git(stint.worktree.path, "status", "--porcelain")).toBe("?? .env");
  expect(stint).toMatchObject({
    checkpointWarnings: [{ path: ".env", reasons: ["likely-secret"], excluded: true }],
  });
  const log = await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8");
  expect(JSON.parse(log.trim().split("\n").at(-1) ?? "")).toMatchObject({
    type: "ended",
    checkpointWarnings: [{ path: ".env", reasons: ["likely-secret"], excluded: true }],
  });
  expect(log).not.toContain("PRIVATE_VALUE");
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.attentionItems).toContainEqual(
    expect.objectContaining({
      kind: "checkpoint-warning",
      stintId: stint.id,
      warnings: [{ path: ".env", reasons: ["likely-secret"], excluded: true }],
    }),
  );
  const diff = await (await project.app.request("/api/work-items/first/diff")).json();
  expect(diff.files.map((file: { path: string }) => file.path)).not.toContain(".env");
  expect(JSON.stringify(diff)).not.toContain("PRIVATE_VALUE");
});

test("checkpoints exclude staged secrets, oversized files and nested generated output without losing ordinary work", async () => {
  const { root, project } = await fixture();
  const first = await start(project);
  const worktree = first.worktree.path;
  const risky: CheckpointWarning[] = [
    ...[
      ".env.local",
      "config/.env.example",
      "keys/private.pem",
      "keys/private.key",
      "keys/id_rsa.pub",
      "credentials.json",
      "config/access-token.yaml",
      "config/secrets.json",
      "nested/.env\nprivate",
    ].map((path) => ({
      path,
      reasons: ["likely-secret"] as CheckpointWarning["reasons"],
      excluded: true as const,
    })),
    ...[
      "node_modules/pkg/index.js",
      "nested/dist/index.js",
      "build/output.js",
      "coverage/output.json",
    ].map((path) => ({
      path,
      reasons: ["generated-directory"] as CheckpointWarning["reasons"],
      excluded: true as const,
    })),
    { path: "large.bin", reasons: ["large-file"], excluded: true },
    {
      path: "dist/token.key",
      reasons: ["likely-secret", "large-file", "generated-directory"],
      excluded: true,
    },
  ];
  for (const warning of risky) {
    await mkdir(dirname(join(worktree, warning.path)), { recursive: true });
    await writeFile(
      join(worktree, warning.path),
      warning.reasons.includes("large-file") ? Buffer.alloc(1024 * 1024 + 1) : "Private fixture\n",
    );
  }
  await writeFile(join(worktree, "boundary.bin"), Buffer.alloc(1024 * 1024));
  await writeFile(join(worktree, "ordinary file\n[1].txt"), "Keep\n");
  git(worktree, "add", "--", ".env.local", "large.bin", "boundary.bin");
  const stint = await start(project);
  expect(stint.checkpointWarnings).toEqual(
    risky.sort((first, second) => (first.path < second.path ? -1 : 1)),
  );
  const committed = git(worktree, "ls-tree", "-r", "--name-only", "-z", "HEAD").split("\0");
  expect(committed).toContain("ordinary file\n[1].txt");
  expect(git(worktree, "cat-file", "-s", "HEAD:boundary.bin")).toBe(String(1024 * 1024));
  expect(
    git(worktree, "diff", "--cached", "--name-only", "-z").split("\0").filter(Boolean),
  ).toEqual([".env.local", "large.bin"]);
  for (const { path } of risky) {
    expect(committed).not.toContain(path);
    await expect(readFile(join(worktree, path))).resolves.toBeDefined();
  }
  await expect(mergeLocalWorkItem(root, "first", async () => {})).rejects.toThrow(
    "Commit worktree changes",
  );
});

test.each(["failed", "stopped"])(
  "%s stints still exclude secrets at their checkpoint",
  async (status) => {
    const { project } = await fixture([
      { type: "write", path: ".env", content: "Private\n" },
      status === "failed" ? { type: "crash" } : { type: "hang" },
    ]);
    const active = await begin(project);
    if (status === "stopped") {
      await expect
        .poll(() =>
          readFile(join(active.worktree.path, ".env"), "utf8").then(
            () => true,
            () => false,
          ),
        )
        .toBe(true);
      expect(
        (await project.app.request(`/api/stints/${active.id}/stop`, { method: "POST" })).status,
      ).toBe(202);
    }
    const stint = await ended(project, active.id, status);
    expect(stint.checkpointWarnings).toEqual([
      { path: ".env", reasons: ["likely-secret"], excluded: true },
    ]);
    expect(git(stint.worktree.path, "ls-tree", "--name-only", "HEAD").split("\n")).not.toContain(
      ".env",
    );
  },
);

test("interrupted stint recovery uses the same checkpoint guard and persists its warnings across restart", async () => {
  const { root, project, tracked } = await fixture();
  const stint = await start(project);
  const path = join(root, `.stintwork/local/stints/${stint.id}.jsonl`);
  const started: StintLogEntry = JSON.parse((await readFile(path, "utf8")).split("\n")[0]);
  await project.stop();
  await writeFile(path, `${JSON.stringify(started)}\n`);
  await rm(join(root, ".stintwork/local/.gitignore"));
  await rm(join(stint.worktree.path, ".stintwork/local/.gitignore"));
  await writeFile(join(stint.worktree.path, ".env"), "Private\n");
  await writeFile(join(stint.worktree.path, "ordinary.txt"), "Keep\n");
  tracked.project = createProjectServer(root, join(root, "web"));
  const snapshot: ProjectSnapshot = await (
    await tracked.project.app.request("/api/project")
  ).json();
  expect(snapshot.workItems[0].stints[0]).toMatchObject({
    status: "interrupted",
    checkpointWarnings: [{ path: ".env", reasons: ["likely-secret"], excluded: true }],
  });
  expect(git(stint.worktree.path, "ls-tree", "--name-only", "HEAD").split("\n")).not.toContain(
    ".env",
  );
  expect(git(root, "status", "--porcelain", "--untracked-files=all")).toBe("");
  expect(await readFile(join(root, ".stintwork/local/.gitignore"), "utf8")).toBe("*\n");
});

test("interrupted recovery reports the agent's earlier commits as well as checkpoint exclusions", async () => {
  const { root, project, tracked } = await fixture();
  const stint = await start(project);
  const path = join(root, `.stintwork/local/stints/${stint.id}.jsonl`);
  const started: StintLogEntry = JSON.parse((await readFile(path, "utf8")).split("\n")[0]);
  await project.stop();
  await writeFile(path, `${JSON.stringify(started)}\n`);
  await writeFile(join(stint.worktree.path, ".env"), "API_TOKEN=dummy\n");
  git(stint.worktree.path, "add", ".env");
  git(stint.worktree.path, "commit", "--quiet", "-m", "Agent work before interruption");
  const commit = git(stint.worktree.path, "rev-parse", "HEAD");
  await mkdir(join(stint.worktree.path, "dist"));
  await writeFile(join(stint.worktree.path, "dist/bundle.js"), "Pending output\n");
  tracked.project = createProjectServer(root, join(root, "web"));
  const snapshot: ProjectSnapshot = await (
    await tracked.project.app.request("/api/project")
  ).json();
  expect(snapshot.workItems[0].stints[0]).toMatchObject({
    status: "interrupted",
    checkpointWarnings: [
      { path: "dist/bundle.js", reasons: ["generated-directory"], excluded: true },
      {
        path: ".env",
        reasons: ["likely-secret"],
        excluded: false,
        committed: true,
        commits: [commit],
      },
    ],
  });
  expect(snapshot.attentionItems.some(({ kind }) => kind === "checkpoint-warning")).toBe(true);
});

test("PR-check records ignore themselves without any stint or guided setup", async () => {
  const { parent, root } = await fixture();
  const fake = await fakeGh(join(parent, "bin"));
  vi.stubEnv("PATH", fake.path);
  const headCommit = git(root, "rev-parse", "HEAD");
  const pr = {
    number: 12,
    url: "https://github.com/example/project/pull/12",
    repo: "example/project",
    branch: "stintwork/first",
    base: "main",
    headCommit,
    remote: "origin",
    remoteUrl: "https://github.com/example/project.git",
  };
  await fake.script({
    "pr view": {
      stdout: {
        number: 12,
        url: pr.url,
        state: "OPEN",
        headRefOid: headCommit,
        headRefName: pr.branch,
        baseRefName: "main",
        mergeCommit: null,
        mergedAt: null,
        isCrossRepository: false,
      },
    },
    "pr checks": { stdout: [{ name: "CI", bucket: "pass", link: "" }] },
  });
  expect((await fetchPullRequestChecks(root, pr)).checks[0].bucket).toBe("pass");
  expect(git(root, "status", "--porcelain", "--untracked-files=all")).toBe("");
  expect(await readFile(join(root, ".stintwork/local/.gitignore"), "utf8")).toBe("*\n");
  git(root, "add", "--all");
  expect(git(root, "diff", "--cached", "--name-only")).toBe("");
});

test.each(["local", "ignore"])(
  "check logs refuse a symlinked %s data destination",
  async (target) => {
    const { parent, root, project } = await fixture();
    await ensureWorktree(root, "first");
    const outside = join(parent, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "ignore"), "Preserve\n");
    if (target === "local") await symlink(outside, join(root, ".stintwork/local"));
    else {
      await mkdir(join(root, ".stintwork/local"));
      await symlink(join(outside, "ignore"), join(root, ".stintwork/local/.gitignore"));
    }
    const response = await project.app.request("/api/work-items/first/checks", { method: "POST" });
    expect(response.ok).toBe(false);
    expect((await response.json()).reason).toMatch(/real directories|regular file/);
    expect(await readFile(join(outside, "ignore"), "utf8")).toBe("Preserve\n");
  },
);

test("staged secret versions survive exclusion even without a working copy", async () => {
  const { project } = await fixture();
  const first = await start(project);
  const worktree = first.worktree.path;
  await writeFile(join(worktree, ".env"), "Private\n");
  git(worktree, "add", ".env");
  const staged = git(worktree, "rev-parse", ":.env");
  await rm(join(worktree, ".env"));
  const stint = await start(project);
  expect(stint.checkpointCommit).toBe(first.checkpointCommit);
  expect(stint.checkpointWarnings).toEqual([
    { path: ".env", reasons: ["likely-secret"], excluded: true },
  ]);
  expect(git(worktree, "rev-parse", ":.env")).toBe(staged);
  expect(git(worktree, "ls-tree", "--name-only", "HEAD").split("\n")).not.toContain(".env");
});

test("a tracked secret edit stays uncommitted with its staged version intact, but deleting it can be checkpointed", async () => {
  const { project } = await fixture();
  const first = await start(project);
  const worktree = first.worktree.path;
  await writeFile(join(worktree, ".env"), "Old fixture\n");
  git(worktree, "add", ".env");
  git(worktree, "commit", "--quiet", "-m", "Developer's existing file");
  const original = git(worktree, "rev-parse", "HEAD:.env");
  await writeFile(join(worktree, ".env"), "Staged fixture\n");
  git(worktree, "add", ".env");
  const staged = git(worktree, "rev-parse", ":.env");
  await writeFile(join(worktree, ".env"), "Working fixture\n");
  await writeFile(join(worktree, "ordinary.txt"), "Keep\n");
  const stint = await start(project);
  expect(stint.checkpointWarnings).toHaveLength(1);
  expect(git(worktree, "rev-parse", "HEAD:.env")).toBe(original);
  expect(git(worktree, "rev-parse", ":.env")).toBe(staged);
  expect(await readFile(join(worktree, ".env"), "utf8")).toBe("Working fixture\n");
  await rm(join(worktree, ".env"));
  git(worktree, "add", ".env");
  const deleted = await start(project);
  expect(deleted.checkpointWarnings).toBeUndefined();
  expect(git(worktree, "ls-tree", "--name-only", "HEAD").split("\n")).not.toContain(".env");
});

test("checkpoint warnings are recorded even when the safe commit fails", async () => {
  const { root, project } = await fixture();
  const first = await start(project);
  await writeFile(join(first.worktree.path, ".env"), "Private\n");
  await writeFile(join(first.worktree.path, "ordinary.txt"), "Keep\n");
  await writeFile(join(root, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const stint = await start(project, "failed");
  expect(stint.error).toContain("Checkpoint failed");
  expect(stint.checkpointWarnings).toEqual([
    { path: ".env", reasons: ["likely-secret"], excluded: true },
  ]);
  expect(git(first.worktree.path, "ls-tree", "--name-only", "HEAD").split("\n")).not.toContain(
    ".env",
  );
});

test("handoff answers repair the local ignore file before appending local data", async () => {
  const { root, project } = await fixture(
    [],
    [
      {
        type: "message",
        text: "## Where I stopped\nWork recorded.\n## Unresolved\nWhich format?\n## Suggested next\nChoose a format.",
      },
    ],
  );
  const stint = await start(project);
  await rm(join(root, ".stintwork/local/.gitignore"));
  const response = await project.app.request(`/api/stints/${stint.id}/handoff-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: null }),
  });
  expect(response.status).toBe(200);
  expect(await readFile(join(root, ".stintwork/local/.gitignore"), "utf8")).toBe("*\n");
  expect(git(root, "status", "--porcelain", "--untracked-files=all")).toBe("");
});
