import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

function git(root: string, args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 1000,
  });
}

export function listWorkItemWorktrees(repoRoot: string) {
  const root = realpathSync(repoRoot);
  const parent = join(dirname(root), `${basename(root)}-worktrees`);
  const registryPath = join(
    resolve(root, git(root, ["rev-parse", "--git-common-dir"]).trim()),
    "worktrees",
  );
  if (lstatSync(parent, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error("Worktree directory must not be a symlink.");
  const worktrees = new Map<string, { path: string; branch: string }>();
  for (const record of git(root, ["worktree", "list", "--porcelain", "-z"]).split("\0\0")) {
    const fields = record.split("\0");
    const path = fields.find((field) => field.startsWith("worktree "))?.slice(9);
    const branch = fields.find((field) => field.startsWith("branch refs/heads/"))?.slice(18);
    const slug = branch?.startsWith("stintwork/") ? branch.slice(10) : undefined;
    if (
      path &&
      slug &&
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug) &&
      path === join(parent, slug) &&
      lstatSync(path, { throwIfNoEntry: false })?.isDirectory()
    )
      worktrees.set(slug, { path, branch: `stintwork/${slug}` });
  }
  return { worktrees, registryPath };
}

/** New worktrees retain their creation base in Git config; older ones use the branch reflog. */
export function workItemFilesDiverged(root: string, slug: string): boolean {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) throw new Error("Invalid work item slug.");
  const branch = `stintwork/${slug}`;
  let base: string;
  try {
    base = git(root, ["config", "--get", `branch.${branch}.stintwork-base`]).trim();
  } catch (error) {
    if ((error as { status?: number }).status !== 1) throw error;
    base =
      git(root, ["reflog", "show", "--format=%H %gs", `refs/heads/${branch}`])
        .trim()
        .split("\n")
        .reverse()
        .find((entry) => /^[a-f\d]+ branch: Created from /i.test(entry))
        ?.split(" ")[0] ?? "";
  }
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(base))
    throw new Error("Cannot determine the worktree's creation base commit.");
  const scope = `.scratch/${slug}/`;
  try {
    git(root, ["--literal-pathspecs", "diff", "--quiet", base, "--", scope]);
  } catch (error) {
    if ((error as { status?: number }).status !== 1) throw error;
    return true;
  }
  return git(root, ["--literal-pathspecs", "ls-files", "--others", "-z", "--", scope]) !== "";
}
