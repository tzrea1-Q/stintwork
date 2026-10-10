import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAgentRegistry } from "@stintwork/agents";
import { createFakeAgentLauncher, fakeAgentProfiles } from "@stintwork/agents/testing";
import type { ProjectSnapshot } from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import { afterEach, expect, test, vi } from "vitest";
import { createProjectServer } from "./index.js";
import * as workflowWrites from "./workflow-writes.js";
import * as briefPreview from "./brief-preview.js";

const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
const workflowPath = ".scratch/first/workflow.yaml";
const workflow =
  "# Choice\nworkflow: feature\nstage: implement\nmilestone: M3\nstages:\n  implement:\n    agent: codex\n  review:\n    agent: claude\n";
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
async function fixture(text: string | null = workflow) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-gates-"));
  const root = join(parent, "project");
  for (const [path, content] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md": "# First\nStatus: resolved\nBlocked by: none",
    ...(text === null ? {} : { [workflowPath]: text }),
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  git(root, "init", "-q");
  git(root, "config", "user.name", "Developer Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  git(root, "add", ".");
  git(root, "commit", "-qm", "Fixture");
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry: createAgentRegistry([
      {
        ...fakeAgentProfiles.codex,
        launch: createFakeAgentLauncher(
          [{ type: "hang" }],
          [
            {
              type: "message",
              text: "## Where I stopped\nStopped\n## Unresolved\nNone\n## Suggested next\nApprove",
            },
          ],
        ),
      },
    ]),
    handoffTimeoutMs: 1000,
  });
  fixtures.push({ parent, project });
  return { root, project };
}
function action(
  project: ReturnType<typeof createProjectServer>,
  stage = "implement",
  verb = "approve",
  slug = "first",
) {
  return project.app.request(`/api/work-items/${slug}/gates/${stage}/${verb}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}
async function snapshot(project: ReturnType<typeof createProjectServer>): Promise<ProjectSnapshot> {
  return (await project.app.request("/api/project")).json();
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});

test("approval in the main checkout records HEAD, preserves preferences, advances the snapshot, and reopen reverses it", async () => {
  const { root, project } = await fixture();
  const before = git(root, "rev-parse", "HEAD");
  expect((await snapshot(project)).attentionItems).toMatchObject([
    { kind: "gate-ready", stage: "implement" },
  ]);
  const response = await action(project);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    stage: "review",
    commit: null,
    record: { by: "Developer Tests", commit: before, at: expect.any(String) },
  });
  const approved = await readFile(join(root, workflowPath), "utf8");
  expect(approved).toContain("# Choice");
  expect(approved).toContain("agent: claude");
  expect(approved).toContain("milestone: M3");
  expect(approved).toContain("approved:");
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
  expect((await snapshot(project)).workItems[0]).toMatchObject({
    stage: "review",
    column: "review",
    inferred: false,
  });
  expect((await snapshot(project)).attentionItems).toEqual([]);
  expect((await action(project)).status).toBe(409);
  expect((await action(project, "implement", "reopen")).status).toBe(200);
  expect((await snapshot(project)).workItems[0]).toMatchObject({
    stage: "implement",
    column: "implement",
    stages: {
      implement: {
        approved: { commit: before },
        reopened: { by: "Developer Tests", commit: before },
      },
    },
  });
  expect((await action(project, "spec", "reopen")).status).toBe(409);
});

test("worktree gate actions commit only workflow.yaml and leave main and unrelated staged changes untouched", async () => {
  const { root, project } = await fixture();
  const worktree = await ensureWorktree(root, "first");
  const before = git(worktree.path, "rev-parse", "HEAD");
  await writeFile(join(worktree.path, "unrelated.txt"), "Preserve me");
  git(worktree.path, "add", "unrelated.txt");
  const response = await action(project);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.record.commit).toBe(before);
  expect(result.commit).toBe(git(worktree.path, "rev-parse", "HEAD"));
  expect(result.commit).not.toBe(before);
  expect(git(worktree.path, "show", "--format=", "--name-only", "HEAD")).toBe(workflowPath);
  expect(git(worktree.path, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
  expect(await readFile(join(root, workflowPath), "utf8")).toBe(workflow);
  expect((await snapshot(project)).workItems[0]).toMatchObject({
    stage: "review",
    column: "review",
  });
  const reopen = await action(project, "implement", "reopen");
  expect(reopen.status).toBe(200);
  expect((await reopen.json()).commit).not.toBe(result.commit);
  expect((await snapshot(project)).workItems[0].stage).toBe("implement");
  expect(await readFile(join(root, workflowPath), "utf8")).toBe(workflow);
});

test("an inferred stage gets workflow.yaml on its first approval", async () => {
  const { root, project } = await fixture(null);
  const worktree = await ensureWorktree(root, "first");
  await mkdir(join(root, ".stintwork/local/stints"), { recursive: true });
  await writeFile(
    join(root, ".stintwork/local/stints/review.jsonl"),
    [
      {
        type: "started",
        at: "2026-10-09T10:00:00Z",
        stint: {
          id: "review",
          workItem: "first",
          stage: "review",
          ticket: null,
          agent: "codex",
          worktree,
          baseCommit: git(root, "rev-parse", "HEAD"),
          brief: {
            prompt: "Review",
            skill: "/code-review",
            pointers: [],
            changedPaths: [],
            lastHandoff: null,
          },
        },
      },
      {
        type: "ended",
        at: "2026-10-09T10:01:00Z",
        status: "finished",
        checkpointCommit: git(worktree.path, "rev-parse", "HEAD"),
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n"),
  );
  expect((await snapshot(project)).workItems[0]).toMatchObject({ stage: "review", inferred: true });
  expect((await action(project, "review")).status).toBe(200);
  expect(await readFile(join(worktree.path, workflowPath), "utf8")).toContain("stage: ship");
  expect(git(worktree.path, "show", `HEAD:${workflowPath}`)).toContain("approved:");
  expect((await snapshot(project)).workItems[0].inferred).toBe(false);
  await expect(readFile(join(root, workflowPath))).rejects.toMatchObject({ code: "ENOENT" });
});

test("readiness uses worktree tickets instead of a resolved main copy", async () => {
  const { root, project } = await fixture();
  const worktree = await ensureWorktree(root, "first");
  await writeFile(
    join(worktree.path, ".scratch/first/issues/01-first.md"),
    "# First\nStatus: open\nBlocked by: none",
  );
  expect((await action(project)).status).toBe(409);
  expect(await readFile(join(worktree.path, workflowPath), "utf8")).toBe(workflow);
});

test("a running stage stint refuses approval and reopen without a workflow write", async () => {
  const { root, project } = await fixture(
    "workflow: feature\nstage: review\nstages:\n  implement:\n    approved: {by: You, at: '2026-10-09T10:00:00Z', commit: head}\n",
  );
  const start = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: null }),
  });
  expect(start.status).toBe(201);
  const { stint } = await start.json();
  const before = await readFile(join(stint.worktree.path, workflowPath), "utf8");
  for (const verb of ["approve", "reopen"]) {
    const response = await action(project, verb === "approve" ? "review" : "implement", verb);
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toContain("stint");
  }
  expect(await readFile(join(stint.worktree.path, workflowPath), "utf8")).toBe(before);
  expect((await snapshot(project)).attentionItems).toEqual([]);
  expect(git(root, "status", "--porcelain", "--", workflowPath)).toBe("");
});

test("failed gate commits restore the workflow and its original index entry", async () => {
  const { root, project } = await fixture();
  const worktree = await ensureWorktree(root, "first");
  await writeFile(join(worktree.path, workflowPath), `${workflow}# Staged preference\n`);
  git(worktree.path, "add", workflowPath);
  const original = `${workflow}# Staged preference\n# Unstaged preference\n`;
  await writeFile(join(worktree.path, workflowPath), original);
  const gitDirectory = git(root, "rev-parse", "--absolute-git-dir");
  const hook = join(gitDirectory, "hooks", "pre-commit");
  await writeFile(hook, "#!/bin/sh\nexit 1\n");
  await chmod(hook, 0o755);
  const head = git(worktree.path, "rev-parse", "HEAD");
  const index = git(worktree.path, "ls-files", "--stage", "--", workflowPath);
  expect((await action(project)).status).toBe(503);
  expect(await readFile(join(worktree.path, workflowPath), "utf8")).toBe(original);
  expect(git(worktree.path, "ls-files", "--stage", "--", workflowPath)).toBe(index);
  expect(git(worktree.path, "rev-parse", "HEAD")).toBe(head);
  expect((await snapshot(project)).workItems[0].stage).toBe("implement");
});

test("gate writes serialize with stage agent choices and stint starts", async () => {
  const { root, project } = await fixture();
  let release: (commit: null) => void = () => {};
  const write = vi.spyOn(workflowWrites, "saveWorkItemWorkflow").mockImplementation(
    () =>
      new Promise<null>((resolve) => {
        release = resolve;
      }),
  );
  const approving = action(project);
  try {
    await expect.poll(() => write.mock.calls.length).toBe(1);
    expect((await action(project)).status).toBe(409);
    const choose = await project.app.request("/api/work-items/first/stages/review/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"agent":"codex"}',
    });
    expect(choose.status).toBe(409);
    const start = await project.app.request("/api/stints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"workItem":"first","ticket":null}',
    });
    expect(start.status).toBe(409);
    expect((await start.json()).reason).toContain("already active");
    expect(git(root, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  } finally {
    release(null);
    await approving;
  }
});

test("a gate change during brief preparation refuses the stale stint start", async () => {
  const { root, project } = await fixture();
  const prepare = briefPreview.prepareStintBrief;
  let release: (() => void) | undefined;
  vi.spyOn(briefPreview, "prepareStintBrief").mockImplementation(async (...args) => {
    const result = await prepare(...args);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return result;
  });
  const starting = project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"workItem":"first","ticket":null}',
  });
  try {
    await expect.poll(() => !!release).toBe(true);
    expect((await action(project)).status).toBe(200);
  } finally {
    release?.();
  }
  const response = await starting;
  expect(response.status).toBe(409);
  expect((await response.json()).reason).toContain("stage changed");
  expect(git(root, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
});

test("invalid actions, cross-origin writes, broken YAML and symlinks cannot change the workflow", async () => {
  const { root, project } = await fixture();
  expect((await action(project, "fix")).status).toBe(400);
  expect((await action(project, "implement", "approve", "missing")).status).toBe(404);
  const endpoint = "/api/work-items/first/gates/implement/approve";
  expect(
    (
      await project.app.request(endpoint, {
        method: "POST",
        headers: { Origin: "https://other.invalid" },
      })
    ).status,
  ).toBe(403);
  for (const body of ["{", "null", "[]"])
    expect(
      (
        await project.app.request(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      ).status,
    ).toBe(400);
  expect((await project.app.request(endpoint, { method: "POST" })).status).toBe(400);
  await writeFile(join(root, workflowPath), "workflow: [");
  expect((await action(project)).status).toBe(409);
  const target = join(root, "outside.yaml");
  await writeFile(target, workflow);
  await rm(join(root, workflowPath));
  await symlink(target, join(root, workflowPath));
  expect([409, 503]).toContain((await action(project)).status);
  expect(await readFile(target, "utf8")).toBe(workflow);
});
