// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { defaultMainBranch, ensureWorktree, workItemDiff } from "./index.js";

const fixtures: string[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function write(root: string, path: string, text: string | Buffer) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
function commit(root: string) {
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture change");
  return git(root, "rev-parse", "HEAD");
}
async function fixture(initialBranch = "main") {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-diff-"));
  fixtures.push(parent);
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", `--initial-branch=${initialBranch}`, root]);
  git(root, "config", "user.name", "Developer");
  git(root, "config", "user.email", "developer@example.invalid");
  await write(root, "changed.txt", "one\ntwo\nthree\n");
  await write(root, "removed.txt", "removed line\n");
  const base = commit(root);
  const worktree = (await ensureWorktree(root, "first")).path;
  return { root, worktree, base };
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("risky files show only metadata, including deleted secrets, even when already committed", async () => {
  const { root, worktree } = await fixture();
  await write(root, ".env.removed", "API_TOKEN=old-dummy\n");
  const main = commit(root);
  git(worktree, "merge", "--quiet", "main");
  await rm(join(worktree, ".env.removed"));
  await write(worktree, ".env", "API_TOKEN=dummy\n");
  await write(worktree, "dist/bundle.js", "generated output\n");
  await write(worktree, "large.bin", Buffer.alloc(1024 * 1024 + 1, "x"));
  commit(worktree);
  const diff = await workItemDiff(root, "first");
  expect(diff.mergeBase).toBe(main);
  expect(diff.files).toHaveLength(4);
  expect(diff.files.every((file) => file.contentsHidden && !file.hunks.length)).toBe(true);
  expect(JSON.stringify(diff)).not.toContain("API_TOKEN");
  expect(JSON.stringify(diff)).not.toContain("generated output");
});

test("added, removed and modified files have counts, hunks and both line numbers", async () => {
  const { root, worktree, base } = await fixture();
  await write(worktree, "added.txt", "new line\nanother\n");
  await write(worktree, "changed.txt", "one\nsecond\nthree\nfour\n");
  await rm(join(worktree, "removed.txt"));
  const head = commit(worktree);
  const diff = await workItemDiff(root, "first");
  expect(diff).toMatchObject({
    branch: "stintwork/first",
    mainBranch: "main",
    mainCommit: base,
    mergeBase: base,
    headCommit: head,
  });
  expect(
    diff.files.map(({ path, status, additions, deletions, binary }) => ({
      path,
      status,
      additions,
      deletions,
      binary,
    })),
  ).toEqual([
    { path: "added.txt", status: "added", additions: 2, deletions: 0, binary: false },
    { path: "changed.txt", status: "modified", additions: 2, deletions: 1, binary: false },
    { path: "removed.txt", status: "removed", additions: 0, deletions: 1, binary: false },
  ]);
  expect(diff.files[0].hunks[0]).toMatchObject({
    oldStart: 0,
    oldCount: 0,
    newStart: 1,
    newCount: 2,
    lines: [
      { kind: "added", oldLine: null, newLine: 1, text: "new line" },
      { kind: "added", oldLine: null, newLine: 2, text: "another" },
    ],
  });
  expect(diff.files[1].hunks[0]).toMatchObject({
    oldStart: 1,
    oldCount: 3,
    newStart: 1,
    newCount: 4,
    lines: [
      { kind: "context", oldLine: 1, newLine: 1, text: "one" },
      { kind: "removed", oldLine: 2, newLine: null, text: "two" },
      { kind: "added", oldLine: null, newLine: 2, text: "second" },
      { kind: "context", oldLine: 3, newLine: 3, text: "three" },
      { kind: "added", oldLine: null, newLine: 4, text: "four" },
    ],
  });
  expect(diff.files[2].hunks[0]).toMatchObject({
    oldStart: 1,
    oldCount: 1,
    newStart: 0,
    newCount: 0,
    lines: [{ kind: "removed", oldLine: 1, newLine: null, text: "removed line" }],
  });
});

test("renames, including edited renames, have old/new paths and counts but no content", async () => {
  const { root, worktree } = await fixture();
  const lines = Array.from({ length: 20 }, (_, index) => `original ${index}\n`).join("");
  await write(worktree, "before.txt", lines);
  commit(worktree);
  git(root, "merge", "--quiet", "--ff-only", "stintwork/first");
  await rename(join(worktree, "before.txt"), join(worktree, "after.txt"));
  await write(worktree, "after.txt", lines.replace("original 3", "changed 3"));
  await rename(join(worktree, "removed.txt"), join(worktree, "renamed.txt"));
  commit(worktree);
  expect((await workItemDiff(root, "first")).files).toEqual([
    {
      path: "after.txt",
      oldPath: "before.txt",
      status: "renamed",
      additions: 1,
      deletions: 1,
      binary: false,
      hunks: [],
    },
    {
      path: "renamed.txt",
      oldPath: "removed.txt",
      status: "renamed",
      additions: 0,
      deletions: 0,
      binary: false,
      hunks: [],
    },
  ]);
});

test("binary additions, modifications and removals omit content and numeric counts", async () => {
  const { root, worktree } = await fixture();
  await write(worktree, "binary.bin", Buffer.from([0, 1, 2]));
  await write(worktree, "deleted.bin", Buffer.from([0, 3, 4]));
  commit(worktree);
  git(root, "merge", "--quiet", "--ff-only", "stintwork/first");
  await write(worktree, "added.bin", Buffer.from([0, 20, 21]));
  await write(worktree, "binary.bin", Buffer.from([0, 5, 6]));
  await rm(join(worktree, "deleted.bin"));
  commit(worktree);
  const files = (await workItemDiff(root, "first")).files;
  expect(files.map((file) => [file.path, file.status])).toEqual([
    ["added.bin", "added"],
    ["binary.bin", "modified"],
    ["deleted.bin", "removed"],
  ]);
  expect(
    files.every(
      (file) =>
        file.binary &&
        file.additions === null &&
        file.deletions === null &&
        file.hunks.length === 0,
    ),
  ).toBe(true);
});

test("an empty committed diff ignores staged, unstaged and untracked work without changing it", async () => {
  const { root, worktree, base } = await fixture();
  await write(worktree, "changed.txt", "Staged work");
  git(worktree, "add", "changed.txt");
  await write(worktree, "changed.txt", "Unstaged work");
  await write(worktree, "untracked.txt", "Untracked work");
  const before = git(worktree, "status", "--porcelain");
  expect(await workItemDiff(root, "first")).toEqual({
    branch: "stintwork/first",
    mainBranch: "main",
    mainCommit: base,
    mergeBase: base,
    headCommit: base,
    files: [],
  });
  expect(git(worktree, "status", "--porcelain")).toBe(before);
});

test("the range uses the current merge base, not main HEAD or worktree creation base", async () => {
  const { root, worktree } = await fixture();
  await write(worktree, "shared.txt", "Shared change\n");
  const shared = commit(worktree);
  git(root, "merge", "--quiet", "--ff-only", "stintwork/first");
  await write(root, "main-only.txt", "Main change\n");
  const main = commit(root);
  await write(worktree, "branch-only.txt", "Work item change\n");
  const head = commit(worktree);
  expect(await workItemDiff(root, "first")).toMatchObject({
    mainCommit: main,
    mergeBase: shared,
    headCommit: head,
    files: [expect.objectContaining({ path: "branch-only.txt", status: "added" })],
  });
});

test("literal paths, trailing whitespace, missing newlines and separate hunks are preserved", async () => {
  const { root, worktree } = await fixture();
  const path = "odd [*]\t\né.txt";
  await write(worktree, path, "last line  ");
  await write(
    worktree,
    "long.txt",
    Array.from({ length: 30 }, (_, index) => `line ${index + 1}\n`).join(""),
  );
  commit(worktree);
  git(root, "merge", "--quiet", "--ff-only", "stintwork/first");
  await write(worktree, path, "new last line  ");
  await write(
    worktree,
    "long.txt",
    Array.from(
      { length: 30 },
      (_, index) => `${index === 1 || index === 25 ? "edited" : "line"} ${index + 1}\n`,
    ).join(""),
  );
  commit(worktree);
  const diff = await workItemDiff(root, "first");
  expect(diff.files.find((file) => file.path === path)?.hunks[0].lines).toEqual([
    { kind: "removed", oldLine: 1, newLine: null, text: "last line  ", noNewline: true },
    { kind: "added", oldLine: null, newLine: 1, text: "new last line  ", noNewline: true },
  ]);
  const hunks = diff.files.find((file) => file.path === "long.txt")?.hunks;
  expect(hunks).toHaveLength(2);
  expect(
    hunks?.flatMap((hunk) =>
      hunk.lines.filter((line) => line.kind === "added").map((line) => line.newLine),
    ),
  ).toEqual([2, 26]);
});

test("mode-only changes remain visible without text hunks", async () => {
  const { root, worktree } = await fixture();
  git(root, "config", "core.fileMode", "true");
  await chmod(join(worktree, "changed.txt"), 0o755);
  commit(worktree);
  expect((await workItemDiff(root, "first")).files).toEqual([
    {
      path: "changed.txt",
      status: "modified",
      additions: 0,
      deletions: 0,
      binary: false,
      hunks: [],
    },
  ]);
});

test("blank context lines retain their numbers even when Git normally suppresses their prefix", async () => {
  const { root, worktree } = await fixture();
  await write(worktree, "changed.txt", "one\n\ntwo\n");
  commit(worktree);
  git(root, "merge", "--quiet", "--ff-only", "stintwork/first");
  git(root, "config", "diff.suppressBlankEmpty", "true");
  await write(worktree, "changed.txt", "one\n\nreplacement\n");
  commit(worktree);
  expect((await workItemDiff(root, "first")).files[0].hunks[0].lines).toEqual([
    { kind: "context", oldLine: 1, newLine: 1, text: "one" },
    { kind: "context", oldLine: 2, newLine: 2, text: "" },
    { kind: "removed", oldLine: 3, newLine: null, text: "two" },
    { kind: "added", oldLine: null, newLine: 3, text: "replacement" },
  ]);
  expect(git(root, "config", "--get", "diff.suppressBlankEmpty")).toBe("true");
});

test("invalid refs and missing branches fail rather than falling back to unrelated work", async () => {
  const { root } = await fixture();
  await expect(workItemDiff(root, "../other")).rejects.toThrow("Invalid work item slug.");
  await expect(workItemDiff(root, "--output=escape")).rejects.toThrow("Invalid work item slug.");
  await expect(workItemDiff(root, "first", "../main")).rejects.toThrow();
  await expect(workItemDiff(root, "missing")).rejects.toThrow();
  git(root, "branch", "-m", "main", "trunk");
  expect((await workItemDiff(root, "first", "trunk")).mainBranch).toBe("trunk");
});

test("a repository whose main branch is master diffs against master", async () => {
  const { root, worktree, base } = await fixture("master");
  await write(worktree, "added.txt", "new line\n");
  const head = commit(worktree);
  expect(await defaultMainBranch(root)).toBe("master");
  expect(await workItemDiff(root, "first")).toMatchObject({
    mainBranch: "master",
    mergeBase: base,
    headCommit: head,
    files: [{ path: "added.txt" }],
  });
});

test("a repository with neither main nor master refuses the diff with a reason", async () => {
  const { root } = await fixture("trunk");
  expect(await defaultMainBranch(root)).toBeNull();
  await expect(workItemDiff(root, "first")).rejects.toThrow("neither main nor master");
});
