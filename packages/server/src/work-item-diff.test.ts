// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAgentRegistry } from "@stintwork/agents";
import { ensureWorktree, type WorkItemDiff } from "@stintwork/git";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
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
async function fixture(withWorktree = true) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-diff-api-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  git(root, "config", "user.name", "Developer");
  git(root, "config", "user.email", "developer@example.invalid");
  await write(root, ".scratch/first/spec.md", "# First");
  await write(root, "original.txt", "before\n");
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const base = git(root, "rev-parse", "HEAD");
  const worktree = withWorktree ? (await ensureWorktree(root, "first")).path : null;
  await write(root, "web/index.html", "<!doctype html><title>Stintwork</title>");
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry: createAgentRegistry([]),
  });
  fixtures.push({ parent, project });
  return { root, worktree, project, base };
}
afterEach(async () => {
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});

test("the endpoint returns the real branch diff and refreshes without starting a watcher or agent", async () => {
  const { root, worktree, project, base } = await fixture();
  if (!worktree) throw new Error("Expected a worktree");
  const endpoint = "/api/work-items/first/diff";
  expect((await (await project.app.request(endpoint)).json()).files).toEqual([]);
  await write(worktree, "original.txt", "after\n");
  git(worktree, "add", "original.txt");
  git(worktree, "commit", "--quiet", "-m", "Work item change");
  const head = git(worktree, "rev-parse", "HEAD");
  await write(worktree, "dirty.txt", "Not committed\n");
  const response = await project.app.request(endpoint);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const diff: WorkItemDiff = await response.json();
  expect(diff).toMatchObject({
    branch: "stintwork/first",
    mainBranch: "main",
    mergeBase: base,
    headCommit: head,
  });
  expect(diff.files).toEqual([
    expect.objectContaining({
      path: "original.txt",
      status: "modified",
      additions: 1,
      deletions: 1,
    }),
  ]);
  expect(diff.files[0].hunks[0].lines).toEqual([
    { kind: "removed", oldLine: 1, newLine: null, text: "before" },
    { kind: "added", oldLine: null, newLine: 1, text: "after" },
  ]);
  expect(git(root, "rev-parse", "HEAD")).toBe(base);
  expect(git(worktree, "status", "--porcelain")).toBe("?? dirty.txt");
});

test("a work item without a worktree returns a clear 409, not an empty diff", async () => {
  const { project } = await fixture(false);
  const response = await project.app.request("/api/work-items/first/diff");
  expect(response.status).toBe(409);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    reason: "This work item has no worktree to review.",
    reasonMessage: { code: "review.worktreeMissing" },
  });
});

test("unknown work items return 404 and unavailable Git refs return a reason", async () => {
  const { root, project } = await fixture();
  const missing = await project.app.request("/api/work-items/missing/diff");
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({
    reason: "Work item not found.",
    reasonMessage: { code: "server.workItemNotFound" },
  });
  git(root, "update-ref", "-d", "refs/heads/main");
  const unavailable = await project.app.request("/api/work-items/first/diff");
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({
    reason: expect.stringContaining("Could not read the work item diff:"),
    reasonMessage: {
      code: "server.diffFailed",
      params: { detail: expect.stringContaining("main") },
    },
  });
});

test("failed worktree discovery is reported as unavailable, not as a missing worktree", async () => {
  const { root, project } = await fixture();
  await write(root, ".git/config", "[invalid config\n");
  const response = await project.app.request("/api/work-items/first/diff");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    reason: expect.stringContaining("Cannot discover worktrees:"),
  });
});
