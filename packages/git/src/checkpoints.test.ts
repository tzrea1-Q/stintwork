import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { changedSince, createCheckpoint, ensureWorktree } from "./index.js";

const fixtures: string[] = [];
const stint = { id: "stint-01", workItem: "first", ticket: 4, status: "finished" };
const spec = ".scratch/first/spec.md";
const ticket = ".scratch/first/issues/04-checkpoint.md";
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
async function write(root: string, path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-checkpoints-"));
  fixtures.push(parent);
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  git(root, "config", "user.name", "Developer");
  git(root, "config", "user.email", "developer@example.invalid");
  await write(root, spec, "# Spec");
  await write(root, ticket, "# Ticket");
  await write(root, "deleted.txt", "Original");
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture");
  return { root, worktree: (await ensureWorktree(root, "first")).path };
}
afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((parent) => rm(parent, { recursive: true, force: true })),
  );
});

test("checkpoints stage additions, edits and deletions only on the work item branch", async () => {
  const { root, worktree } = await fixture();
  const base = git(root, "rev-parse", "HEAD");
  await write(worktree, "created.txt", "Created");
  await write(worktree, spec, "# Changed spec");
  await rm(join(worktree, "deleted.txt"));
  const commit = await createCheckpoint(worktree, stint);
  expect(git(worktree, "rev-list", "--count", `${base}..HEAD`)).toBe("1");
  expect(git(worktree, "show", "--format=%B", "--no-patch", commit)).toContain(
    "stint stint-01; work item first; ticket 4; finished",
  );
  expect(git(worktree, "show", "--format=%an <%ae>", "--no-patch", commit)).toBe(
    "Developer <developer@example.invalid>",
  );
  expect(git(worktree, "status", "--porcelain")).toBe("");
  expect(git(root, "rev-parse", "HEAD")).toBe(base);
  expect(await readFile(join(root, spec), "utf8")).toBe("# Spec");
  expect(await createCheckpoint(worktree, stint)).toBe(commit);
  expect(git(worktree, "rev-list", "--count", `${base}..HEAD`)).toBe("1");
});

test("missing git identity falls back without changing project config", async () => {
  const { root, worktree } = await fixture();
  git(root, "config", "user.name", "");
  git(root, "config", "user.email", "");
  await write(worktree, "created.txt", "Created");
  const commit = await createCheckpoint(worktree, stint);
  expect(git(worktree, "show", "--format=%an <%ae>|%cn <%ce>", "--no-patch", commit)).toBe(
    "Stintwork <stintwork@localhost>|Stintwork <stintwork@localhost>",
  );
  expect(git(root, "config", "--get", "user.name")).toBe("");
  expect(git(root, "config", "--get", "user.email")).toBe("");
});

test("changed since compares main checkout content, including staged, deleted and untracked tickets", async () => {
  const { root, worktree } = await fixture();
  const checkpoint = await createCheckpoint(worktree, stint);
  expect(await changedSince(root, checkpoint, "first")).toEqual([]);
  await write(root, spec, "# New requirement");
  git(root, "add", spec);
  await rm(join(root, ticket));
  const added = ".scratch/first/issues/05-new.md";
  await write(root, added, "# New ticket");
  await write(root, ".scratch/first/issues/readme.md", "Not a ticket");
  await write(root, ".scratch/other/spec.md", "Other work item");
  expect(await changedSince(root, checkpoint, "first")).toEqual([ticket, added, spec]);
  await expect(changedSince(root, "--output=escape", "first")).rejects.toThrow(
    "Invalid checkpoint",
  );
  await expect(changedSince(root, checkpoint, "../other")).rejects.toThrow("Invalid work item");
});
