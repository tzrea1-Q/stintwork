import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  createCheckpoint,
  ensureWorktree,
  listWorkItemWorktrees,
  workItemFilesDiverged,
} from "./index.js";

const fixtures: string[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-worktree-files-"));
  fixtures.push(parent);
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  await mkdir(join(root, ".scratch/first"), { recursive: true });
  await writeFile(join(root, ".scratch/first/spec.md"), "# First");
  git(root, "add", ".");
  git(
    root,
    "-c",
    "user.name=Tests",
    "-c",
    "user.email=tests@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "Fixture",
  );
  return { root, parent };
}
afterEach(async () => {
  for (const parent of fixtures.splice(0)) await rm(parent, { recursive: true, force: true });
});

test("discovers only registered, existing worktrees on their expected branch and sibling path", async () => {
  const { root, parent } = await fixture();
  await mkdir(join(parent, "project-worktrees/unregistered"), { recursive: true });
  expect(listWorkItemWorktrees(root).worktrees.size).toBe(0);
  const worktree = await ensureWorktree(root, "first");
  expect(listWorkItemWorktrees(root).worktrees.get("first")).toEqual(worktree);
  git(root, "worktree", "add", "--quiet", "-b", "stintwork/elsewhere", join(parent, "elsewhere"));
  expect([...listWorkItemWorktrees(root).worktrees.keys()]).toEqual(["first"]);
  git(worktree.path, "switch", "--quiet", "-c", "different");
  expect(listWorkItemWorktrees(root).worktrees.size).toBe(0);
  git(worktree.path, "switch", "--quiet", "stintwork/first");
  await rm(worktree.path, { recursive: true });
  expect(listWorkItemWorktrees(root).worktrees.size).toBe(0);
});

test("main divergence uses the creation base, not later worktree commits or main HEAD", async () => {
  const { root } = await fixture();
  const worktree = await ensureWorktree(root, "first");
  expect(workItemFilesDiverged(root, "first")).toBe(false);
  await writeFile(join(worktree.path, ".scratch/first/spec.md"), "# Agent changes");
  await createCheckpoint(worktree.path, {
    id: "one",
    workItem: "first",
    ticket: 1,
    status: "finished",
  });
  expect(workItemFilesDiverged(root, "first")).toBe(false);
  await writeFile(join(root, ".scratch/first/spec.md"), "# Developer changes");
  expect(workItemFilesDiverged(root, "first")).toBe(true);
  await createCheckpoint(root, { id: "main", workItem: "first", ticket: 1, status: "finished" });
  expect(workItemFilesDiverged(root, "first")).toBe(true);
  await writeFile(join(root, ".scratch/first/spec.md"), "# First");
  expect(workItemFilesDiverged(root, "first")).toBe(false);
  await writeFile(join(root, ".scratch/first/notes.md"), "New main file");
  expect(workItemFilesDiverged(root, "first")).toBe(true);
  await rm(join(root, ".scratch/first/notes.md"));
  await rm(join(root, ".scratch/first/spec.md"));
  expect(workItemFilesDiverged(root, "first")).toBe(true);
});

test("older worktrees use their branch creation reflog and fail explicitly when the base is unavailable", async () => {
  const { root } = await fixture();
  await ensureWorktree(root, "first");
  git(root, "config", "--unset", "branch.stintwork/first.stintwork-base");
  expect(workItemFilesDiverged(root, "first")).toBe(false);
  git(root, "reflog", "expire", "--expire=now", "refs/heads/stintwork/first");
  expect(() => workItemFilesDiverged(root, "first")).toThrow("creation base commit");
});

test("discovery does not follow a replaced worktree parent symlink", async () => {
  const { root, parent } = await fixture();
  await ensureWorktree(root, "first");
  const directory = join(parent, "project-worktrees");
  await rename(directory, join(parent, "moved"));
  await symlink(join(parent, "moved"), directory);
  expect(() => listWorkItemWorktrees(root)).toThrow("symlink");
});
