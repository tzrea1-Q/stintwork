import { execFile } from "node:child_process";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

export { changedSince, commitStintworkSetup, createCheckpoint } from "./checkpoints.js";
export { listWorkItemWorktrees, workItemBaseCommit, workItemFilesDiverged } from "./worktrees.js";
export { installWorktreeDependencies, worktreeGitDirectories } from "./worktree-readiness.js";

const execute = promisify(execFile);

/**
 * `git worktree add` and `git config` take locks on files shared by the whole repository, so
 * concurrent stints on different work items must not create worktrees at the same time.
 */
const repoLocks = new Map<string, Promise<unknown>>();
function withRepoLock<T>(root: string, task: () => Promise<T>): Promise<T> {
  const run = (repoLocks.get(root) ?? Promise.resolve()).catch(() => {}).then(task);
  repoLocks.set(root, run);
  return run;
}

export async function ensureWorktree(
  repoRoot: string,
  workItemSlug: string,
): Promise<{ path: string; branch: string }> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(workItemSlug))
    throw new Error("Invalid work item slug.");
  const root = await realpath(resolve(repoRoot));
  return withRepoLock(root, () => ensureWorktreeLocked(root, workItemSlug));
}

async function ensureWorktreeLocked(
  root: string,
  workItemSlug: string,
): Promise<{ path: string; branch: string }> {
  const path = join(dirname(root), `${basename(root)}-worktrees`, workItemSlug);
  const branch = `stintwork/${workItemSlug}`;
  await execute("git", ["check-ref-format", `refs/heads/${branch}`], { cwd: root });
  const { stdout } = await execute("git", ["worktree", "list", "--porcelain", "-z"], { cwd: root });
  const existing = stdout
    .split("\0\0")
    .find((record) => record.split("\0").includes(`worktree ${path}`));
  if (existing) {
    if (
      !existing.split("\0").includes(`branch refs/heads/${branch}`) ||
      !(await lstat(path)).isDirectory()
    ) {
      throw new Error("The work item's worktree is missing or is on a different branch.");
    }
    return { path, branch };
  }
  const parent = dirname(path);
  await mkdir(parent, { recursive: true });
  if ((await lstat(parent)).isSymbolicLink())
    throw new Error("Worktree directory must not be a symlink.");
  await execute("git", ["worktree", "add", "-b", branch, path, "HEAD"], { cwd: root });
  const { stdout: base } = await execute("git", ["rev-parse", "HEAD"], { cwd: path });
  await execute("git", ["config", "--local", `branch.${branch}.stintwork-base`, base.trim()], {
    cwd: root,
  });
  return { path, branch };
}
