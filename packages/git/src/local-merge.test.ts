// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  dryRunLocalMerge,
  ensureWorktree,
  listWorkItemWorktrees,
  mergeLocalWorkItem,
  withRepoLock,
} from "./index.js";

const parents: string[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-merge-"));
  parents.push(parent);
  const root = join(parent, "project");
  git(parent, "init", "--quiet", "--initial-branch=main", root);
  git(root, "config", "user.name", "Developer Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  await mkdir(join(root, ".scratch/first"), { recursive: true });
  await writeFile(join(root, ".scratch/first/workflow.yaml"), "workflow: feature\nstage: ship\n");
  await writeFile(join(root, "code.txt"), "base\n");
  await writeFile(join(root, "unrelated.txt"), "base\n");
  await writeFile(join(root, ".gitignore"), "ignored/\n");
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Base");
  const worktree = await ensureWorktree(root, "first");
  await writeFile(join(worktree.path, "code.txt"), "work item\n");
  git(worktree.path, "add", "code.txt");
  git(worktree.path, "commit", "--quiet", "-m", "Work item");
  return { root, worktree, head: git(worktree.path, "rev-parse", "HEAD") };
}
afterEach(async () => {
  for (const parent of parents.splice(0)) await rm(parent, { recursive: true, force: true });
});

test("dry-run reports conflicts without changing main, its index, or the worktree", async () => {
  const { root, worktree } = await fixture();
  await writeFile(join(root, "code.txt"), "main\n");
  git(root, "add", "code.txt");
  git(root, "commit", "--quiet", "-m", "Main change");
  const before = git(root, "rev-parse", "HEAD");
  expect(await dryRunLocalMerge(root, "first")).toMatchObject({
    mainBranch: "main",
    mainCommit: before,
    conflicts: ["code.txt"],
  });
  await expect(mergeLocalWorkItem(root, "first", async () => {})).rejects.toMatchObject({
    conflicts: ["code.txt"],
  });
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
  expect(git(root, "status", "--porcelain")).toBe("");
  expect(await readFile(join(root, "code.txt"), "utf8")).toBe("main\n");
  expect(await readFile(join(worktree.path, "code.txt"), "utf8")).toBe("work item\n");
  expect(listWorkItemWorktrees(root).worktrees.has("first")).toBe(true);
});

test.each([false, true])(
  "%s: fast-forward or a named two-parent merge preserves unrelated staged and unstaged work",
  async (diverged) => {
    const { root, worktree, head } = await fixture();
    if (diverged) {
      await writeFile(join(root, "main.txt"), "main\n");
      git(root, "add", "main.txt");
      git(root, "commit", "--quiet", "-m", "Main change");
    }
    const main = git(root, "rev-parse", "HEAD");
    await writeFile(join(root, "unrelated.txt"), "staged\n");
    git(root, "add", "unrelated.txt");
    await writeFile(join(root, "unrelated.txt"), "unstaged\n");
    await mkdir(join(worktree.path, "ignored"));
    await writeFile(join(worktree.path, "ignored/dependency"), "ignored");
    const commit = await mergeLocalWorkItem(root, "first", async (commit) => {
      expect(git(root, "rev-parse", "HEAD")).toBe(commit);
      expect(listWorkItemWorktrees(root).worktrees.has("first")).toBe(true);
    });
    if (diverged) {
      expect(git(root, "show", "-s", "--format=%P", commit)).toBe(`${main} ${head}`);
      expect(git(root, "show", "-s", "--format=%s", commit)).toBe("Merge work item first");
    } else expect(commit).toBe(head);
    expect(await readFile(join(root, "code.txt"), "utf8")).toBe("work item\n");
    expect(git(root, "show", ":unrelated.txt")).toBe("staged");
    expect(await readFile(join(root, "unrelated.txt"), "utf8")).toBe("unstaged\n");
    expect(listWorkItemWorktrees(root).worktrees.size).toBe(0);
    expect(git(root, "branch", "--list", "stintwork/first")).toBe("");
    await expect(readFile(join(worktree.path, "code.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  },
);

test.each(["staged", "split-index", "unstaged", "workflow", "untracked", "ignored"])(
  "refuses %s main changes without losing them",
  async (kind) => {
    const { root, worktree } = await fixture();
    const path =
      kind === "workflow"
        ? ".scratch/first/workflow.yaml"
        : kind === "ignored"
          ? "ignored/new.txt"
          : kind === "untracked"
            ? "new.txt"
            : "code.txt";
    if (kind === "untracked" || kind === "ignored") {
      if (kind === "ignored") {
        await mkdir(join(root, "ignored"));
        await mkdir(join(worktree.path, "ignored"));
      }
      await writeFile(join(worktree.path, path), "branch\n");
      git(worktree.path, "add", "-f", path);
      git(worktree.path, "commit", "--quiet", "-m", "Add file");
    }
    await writeFile(join(root, path), "developer\n");
    if (kind === "staged" || kind === "split-index") git(root, "add", path);
    if (kind === "split-index") await writeFile(join(root, path), "base\n");
    const main = git(root, "rev-parse", "HEAD");
    await expect(mergeLocalWorkItem(root, "first", async () => {})).rejects.toMatchObject({
      paths: [path],
    });
    expect(git(root, "rev-parse", "HEAD")).toBe(main);
    expect(await readFile(join(root, path), "utf8")).toBe(
      kind === "split-index" ? "base\n" : "developer\n",
    );
    if (kind === "split-index") expect(git(root, "show", `:${path}`)).toBe("developer");
  },
);

test("refuses dirty worktrees and a main checkout on another branch", async () => {
  const { root, worktree } = await fixture();
  await writeFile(join(worktree.path, "uncommitted"), "keep");
  await expect(mergeLocalWorkItem(root, "first", async () => {})).rejects.toThrow(
    "Commit worktree changes",
  );
  git(root, "switch", "--quiet", "-c", "developer");
  await expect(dryRunLocalMerge(root, "first")).rejects.toThrow("main checkout");
});

test("recording failure retains worktree and branch, and can be retried", async () => {
  const { root, head } = await fixture();
  await expect(
    mergeLocalWorkItem(root, "first", async () => {
      throw new Error("record unavailable");
    }),
  ).rejects.toThrow("worktree and branch retained");
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
  expect(listWorkItemWorktrees(root).worktrees.has("first")).toBe(true);
  const recorded: string[] = [];
  await mergeLocalWorkItem(root, "first", async (commit) => {
    recorded.push(commit);
  });
  expect(recorded).toEqual([head]);
});

test("the existing repo lock serializes merge, record and cleanup with other worktree operations", async () => {
  const { root } = await fixture();
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  const merging = mergeLocalWorkItem(root, "first", async () => {
    entered();
    await pause;
  });
  await started;
  let secondEntered = false;
  const second = withRepoLock(root, async () => {
    secondEntered = true;
    expect(listWorkItemWorktrees(root).worktrees.size).toBe(0);
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(secondEntered).toBe(false);
  release();
  await Promise.all([merging, second]);
});
