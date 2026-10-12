// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAgentRegistry } from "@stintwork/agents";
import {
  createFakeAgentLauncher,
  fakeAgentProfiles,
  type FakeAgentStep,
} from "@stintwork/agents/testing";
import type { ProjectSnapshot, Stint, WorkItemChecks } from "@stintwork/core";
import {
  createCheckpoint,
  ensureWorktree,
  listWorkItemWorktrees,
  withRepoLock,
} from "@stintwork/git";
import * as gitOperations from "@stintwork/git";
import { afterEach, expect, test, vi } from "vitest";
import { createProjectServer } from "./index.js";

const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
const endpoint = "/api/work-items/first";
const finding =
  "## Finding\nAxis: Spec\nSeverity: minor\nPath: code.txt\nLine: 1\nTitle: Keep evidence\n### Body\nKeep the history visible.";
const handoff =
  "## Where I stopped\nFinished.\n## Unresolved\nNone\n## Suggested next\nShip the change.";
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function write(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
async function fixture(script: readonly FakeAgentStep[] = []) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-ship-"));
  const root = join(parent, "project");
  git(parent, "init", "--quiet", "--initial-branch=main", root);
  git(root, "config", "user.name", "Developer Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  for (const [path, text] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    "AGENTS.md": "Conventions\n",
    "GLOSSARY.md": "Original\n",
    ".gitignore": ".stintwork/local/\n",
    ".stintwork/config": "checks:\n  - name: Test\n    command: node check.cjs\n",
    "check.cjs": "console.log('passed');\n",
    ".scratch/first/spec.md": "# First\nShip locally.",
    ".scratch/first/issues/01-first.md": "# First ticket\nStatus: resolved\nBlocked by: none",
    ".scratch/first/workflow.yaml":
      "workflow: feature\nstage: review\nstages:\n  implement:\n    approved: {by: You, at: '2020-01-01T00:00:00Z', commit: base}\n",
    "code.txt": "base\n",
    "unrelated.txt": "base\n",
  }))
    await write(root, path, text);
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const worktree = await ensureWorktree(root, "first");
  await write(worktree.path, "code.txt", "work item\n");
  git(worktree.path, "add", "code.txt");
  git(worktree.path, "commit", "--quiet", "-m", "Work item");
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry: createAgentRegistry([
      { ...fakeAgentProfiles.codex, launch: createFakeAgentLauncher([]) },
    ]),
    handoffTimeoutMs: 3000,
    launchAgent: createFakeAgentLauncher(script, [], {
      afterTurnRequests: [
        [{ type: "message", text: handoff }],
        [{ type: "message", text: finding }],
      ],
    }),
  });
  fixtures.push({ parent, project });
  return { root, worktree, project };
}
afterEach(async () => {
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});
function post(project: ReturnType<typeof createProjectServer>, path: string, body = {}) {
  return project.app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function snapshot(project: ReturnType<typeof createProjectServer>): Promise<ProjectSnapshot> {
  return (await project.app.request("/api/project")).json();
}
async function review(project: ReturnType<typeof createProjectServer>) {
  const response = await post(project, "/api/stints", { workItem: "first" });
  expect(response.status, await response.clone().text()).toBe(201);
  const { stint: started } = await response.json();
  let stint: Stint | undefined;
  await expect
    .poll(async () => {
      ({ stint } = await (await project.app.request(`/api/stints/${started.id}`)).json());
      return stint?.status;
    })
    .toBe("finished");
  return stint as Stint;
}
async function ready(project: ReturnType<typeof createProjectServer>) {
  const stint = await review(project);
  const id = stint.findings?.findings?.[0].id;
  expect(
    (
      await post(project, `${endpoint}/findings/decision`, {
        id,
        status: "accepted",
        reason: "History verified",
      })
    ).status,
  ).toBe(200);
  expect((await post(project, `${endpoint}/checks`)).status).toBe(202);
  await expect
    .poll(async () => {
      const result: WorkItemChecks = await (await project.app.request(`${endpoint}/checks`)).json();
      return result.checkExecution;
    })
    .toBeNull();
  const approval = await post(project, `${endpoint}/gates/review/approve`);
  expect(approval.status, await approval.clone().text()).toBe(200);
  return stint;
}
async function forceShip(worktree: { path: string }) {
  await write(worktree.path, ".scratch/first/workflow.yaml", "workflow: feature\nstage: ship\n");
  await createCheckpoint(worktree.path, {
    id: "fixture",
    workItem: "first",
    ticket: null,
    status: "finished",
  });
}

test("Review refuses an agent's committed risks until every path is explicitly accepted", async () => {
  const script: FakeAgentStep[] = [
    { type: "write", path: ".env.fixture", content: "API_TOKEN=dummy\n" },
    { type: "write", path: "dist/bundle.js", content: "dummy fixture\n" },
    { type: "commit", message: "Resolve .scratch/first/issues/01-first.md" },
  ];
  const { project } = await fixture(script);
  const stint = await review(project);
  expect(stint.checkpointWarnings?.every((warning) => !warning.excluded)).toBe(true);
  expect(
    (
      await post(project, `${endpoint}/findings/decision`, {
        id: stint.findings?.findings?.[0].id,
        status: "accepted",
        reason: "History verified",
      })
    ).status,
  ).toBe(200);
  expect((await post(project, `${endpoint}/checks`)).status).toBe(202);
  await expect
    .poll(
      async () => (await (await project.app.request(`${endpoint}/checks`)).json()).checkExecution,
    )
    .toBeNull();
  const approval = await post(project, `${endpoint}/gates/review/approve`);
  expect(approval.status).toBe(409);
  expect(
    (await approval.json()).conditions.find(
      (condition: { id: string }) => condition.id === "risky-paths",
    ),
  ).toMatchObject({ ready: false });
  const risks = (await snapshot(project)).workItems[0].riskyPaths ?? [];
  expect(risks).toHaveLength(2);
  for (const risk of risks) {
    expect(
      (
        await post(project, `${endpoint}/risky-paths/accept`, {
          id: risk.path,
          blob: risk.blob,
          reason: "Deliberate dummy fixture",
        })
      ).status,
    ).toBe(200);
  }
  expect((await post(project, `${endpoint}/gates/review/approve`)).status).toBe(409);
  script.splice(0);
  await ready(project);
  expect((await post(project, `${endpoint}/ship/merge-local`)).status).toBe(200);
});

test.each(["merge-local", "merge-pr"])(
  "%s reinspects manual commits after Review approval",
  async (action) => {
    const { root, worktree, project } = await fixture();
    await ready(project);
    const main = git(root, "rev-parse", "HEAD");
    await write(worktree.path, ".env", "API_TOKEN=dummy\n");
    git(worktree.path, "add", ".env");
    git(worktree.path, "commit", "--quiet", "-m", "Risk added by hand after approval");
    const response = await post(project, `${endpoint}/ship/${action}`);
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toContain("No risky files on the branch");
    expect(git(root, "rev-parse", "HEAD")).toBe(main);
  },
);

test.each([false, true])(
  "local shipping (%s divergence) records its own main commit and retains history, findings and checks after cleanup and restart",
  async (diverged) => {
    const { root, worktree, project } = await fixture();
    const stint = await ready(project);
    const branchHead = git(worktree.path, "rev-parse", "HEAD");
    if (diverged) {
      await write(root, "main.txt", "main\n");
      git(root, "add", "main.txt");
      git(root, "commit", "--quiet", "-m", "Main change");
    }
    const mainHead = git(root, "rev-parse", "HEAD");
    await write(root, "unrelated.txt", "staged\n");
    git(root, "add", "unrelated.txt");
    await write(root, "unrelated.txt", "unstaged\n");
    const before = (await snapshot(project)).workItems[0];
    const response = await post(project, `${endpoint}/ship/merge-local`);
    expect(response.status, await response.clone().text()).toBe(200);
    const { merged } = await response.json();
    expect(merged.commit).toBe(diverged ? git(root, "rev-parse", "HEAD^") : branchHead);
    if (diverged)
      expect(git(root, "show", "-s", "--format=%P", merged.commit)).toBe(
        `${mainHead} ${branchHead}`,
      );
    expect(git(root, "log", "-1", "--format=%s")).toBe("Record merge of first");
    expect(git(root, "show", "-s", "--format=%P", "HEAD")).toBe(merged.commit);
    expect(git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")).toBe(
      ".scratch/first/workflow.yaml",
    );
    expect(await readFile(join(root, ".scratch/first/workflow.yaml"), "utf8")).toContain(
      merged.commit,
    );
    expect(git(root, "show", ":unrelated.txt")).toBe("staged");
    expect(await readFile(join(root, "unrelated.txt"), "utf8")).toBe("unstaged\n");
    expect(listWorkItemWorktrees(root).worktrees.size).toBe(0);
    expect(git(root, "branch", "--list", "stintwork/first")).toBe("");
    const after = await snapshot(project);
    expect(after.warnings).toEqual([]);
    expect(after.workItems[0]).toMatchObject({
      merged,
      headCommit: merged.commit,
      stints: before.stints,
      reviewDecisions: before.reviewDecisions,
      checks: before.checks,
    });
    expect(after.workItems[0].worktreePath).toBeUndefined();
    expect(after.attentionItems.filter(({ workItem }) => workItem === "first")).toEqual([]);
    expect((await (await project.app.request(`${endpoint}/checks`)).json()).checks).toEqual(
      before.checks,
    );
    expect((await (await project.app.request(`/api/stints/${stint.id}`)).json()).stint).toEqual(
      stint,
    );
    expect((await post(project, `${endpoint}/gates/review/reopen`)).status).toBe(409);
    expect((await post(project, `${endpoint}/checks`)).status).toBe(409);
    expect(
      (await post(project, `${endpoint}/stages/review/agent`, { agent: "codex" })).status,
    ).toBe(409);
    const recordedHead = git(root, "rev-parse", "HEAD");
    expect((await post(project, `${endpoint}/ship/merge-local`)).status).toBe(200);
    expect(git(root, "rev-parse", "HEAD")).toBe(recordedHead);
    await project.stop();
    const restarted = createProjectServer(root, join(root, "web"), {
      agentRegistry: createAgentRegistry([]),
    });
    fixtures.push({ parent: dirname(root), project: restarted });
    const restored = await snapshot(restarted);
    expect(restored.warnings).toEqual([]);
    expect(restored.workItems[0]).toMatchObject({
      merged,
      stints: before.stints,
      reviewDecisions: before.reviewDecisions,
      checks: before.checks,
    });
  },
);

test("open memory proposals refuse shipping", async () => {
  const { root, worktree, project } = await fixture([
    { type: "write", path: "GLOSSARY.md", content: "Proposed memory\n" },
  ]);
  await review(project);
  await forceShip(worktree);
  const main = git(root, "rev-parse", "HEAD");
  const response = await post(project, `${endpoint}/ship/merge-local`);
  expect(response.status).toBe(409);
  expect((await response.json()).reason).toContain("open memory proposal");
  expect(git(root, "rev-parse", "HEAD")).toBe(main);
  expect(listWorkItemWorktrees(root).worktrees.has("first")).toBe(true);
});

test("a running stint refuses shipping", async () => {
  const { root, worktree, project } = await fixture([{ type: "hang" }]);
  expect((await post(project, "/api/stints", { workItem: "first" })).status).toBe(201);
  await forceShip(worktree);
  const main = git(root, "rev-parse", "HEAD");
  const response = await post(project, `${endpoint}/ship/merge-local`);
  expect(response.status).toBe(409);
  expect((await response.json()).reason).toContain("stint is running");
  expect(git(root, "rev-parse", "HEAD")).toBe(main);
});

test("dirty touched main files refuse shipping with exact paths", async () => {
  const { root, worktree, project } = await fixture();
  await forceShip(worktree);
  await write(root, "code.txt", "keep developer edits\n");
  const main = git(root, "rev-parse", "HEAD");
  const response = await post(project, `${endpoint}/ship/merge-local`);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    paths: ["code.txt"],
    reason: expect.stringContaining("uncommitted changes"),
  });
  expect(git(root, "rev-parse", "HEAD")).toBe(main);
  expect(await readFile(join(root, "code.txt"), "utf8")).toBe("keep developer edits\n");
});

test("active checks refuse shipping without removing their worktree", async () => {
  const { root, worktree, project } = await fixture();
  await forceShip(worktree);
  await write(worktree.path, "check.cjs", "setTimeout(() => {}, 1000);\n");
  git(worktree.path, "add", "check.cjs");
  git(worktree.path, "commit", "--quiet", "-m", "Slow fixture check");
  expect((await post(project, `${endpoint}/checks`)).status).toBe(202);
  const response = await post(project, `${endpoint}/ship/merge-local`);
  expect(response.status).toBe(409);
  expect((await response.json()).reason).toContain("finish checks");
  expect(listWorkItemWorktrees(root).worktrees.has("first")).toBe(true);
  await expect
    .poll(async () => {
      const result: WorkItemChecks = await (await project.app.request(`${endpoint}/checks`)).json();
      return result.checkExecution;
    })
    .toBeNull();
});

test("conflicts leave main untouched and Send back reopens Implement with conflict paths in the next brief", async () => {
  const { root, worktree, project } = await fixture();
  await forceShip(worktree);
  await write(root, "code.txt", "main change\n");
  git(root, "add", "code.txt");
  git(root, "commit", "--quiet", "-m", "Main conflict");
  const main = git(root, "rev-parse", "HEAD");
  const response = await post(project, `${endpoint}/ship/merge-local`);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ conflicts: ["code.txt"] });
  expect(git(root, "rev-parse", "HEAD")).toBe(main);
  const sent = await post(project, `${endpoint}/ship/send-back`);
  expect(sent.status, await sent.clone().text()).toBe(200);
  expect(await sent.json()).toMatchObject({ stage: "implement", stageName: "Implement" });
  const brief = await project.app.request(`${endpoint}/brief-preview`);
  expect(brief.status).toBe(200);
  expect((await brief.json()).prompt).toContain("Merge conflicts");
  expect(await readFile(join(worktree.path, ".scratch/first/review.yaml"), "utf8")).toContain(
    "code.txt",
  );
  expect(git(root, "rev-parse", "HEAD")).toBe(main);
});

test.each(["record", "cleanup"])(
  "%s failure retains recoverable work and retry does not duplicate recording",
  async (failure) => {
    const { root, worktree, project } = await fixture();
    await forceShip(worktree);
    const head = git(worktree.path, "rev-parse", "HEAD");
    const hook = join(root, ".git/hooks/pre-commit");
    if (failure === "record") {
      await writeFile(hook, "#!/bin/sh\nexit 1\n");
      await chmod(hook, 0o755);
    } else git(root, "worktree", "lock", worktree.path);
    const response = await post(project, `${endpoint}/ship/merge-local`);
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toContain(
      failure === "record" ? "recording failed" : "cleanup failed",
    );
    expect(listWorkItemWorktrees(root).worktrees.has("first")).toBe(true);
    if (failure === "record") await rm(hook);
    else git(root, "worktree", "unlock", worktree.path);
    const retried = await post(project, `${endpoint}/ship/merge-local`);
    expect(retried.status, await retried.clone().text()).toBe(200);
    expect((await retried.json()).merged.commit).toBe(head);
    expect(
      git(root, "log", "--format=%s")
        .split("\n")
        .filter((message) => message === "Record merge of first"),
    ).toHaveLength(1);
    expect(listWorkItemWorktrees(root).worktrees.size).toBe(0);
  },
);

test("Ship endpoints reject wrong stage, foreign origin, malformed JSON and missing work items", async () => {
  const { project } = await fixture();
  expect((await post(project, `${endpoint}/ship/merge-local`)).status).toBe(409);
  expect((await post(project, "/api/work-items/missing/ship/merge-local")).status).toBe(404);
  for (const action of ["merge-local", "send-back"]) {
    expect(
      (
        await project.app.request(`${endpoint}/ship/${action}`, {
          method: "POST",
          headers: { origin: "http://foreign.invalid" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await project.app.request(`${endpoint}/ship/${action}`, { method: "POST" })).status,
    ).toBe(400);
    expect(
      (
        await project.app.request(`${endpoint}/ship/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
    ).toBe(400);
  }
});

test("shipping excludes simultaneous checks, gate writes and another shipping action", async () => {
  const { root, worktree, project } = await fixture();
  await forceShip(worktree);
  await snapshot(project);
  let entered: () => void = () => {};
  let release: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = withRepoLock(root, async () => {
    entered();
    await pause;
  });
  await started;
  const merge = vi.spyOn(gitOperations, "mergeLocalWorkItem");
  const merging = post(project, `${endpoint}/ship/merge-local`);
  try {
    await expect.poll(() => merge.mock.calls.length).toBe(1);
    expect((await post(project, `${endpoint}/checks`)).status).toBe(409);
    expect((await post(project, `${endpoint}/gates/review/reopen`)).status).toBe(409);
    expect((await post(project, `${endpoint}/ship/merge-local`)).status).toBe(409);
  } finally {
    merge.mockRestore();
    release();
    await held;
    const response = await merging;
    expect(response.status, await response.clone().text()).toBe(200);
  }
});
