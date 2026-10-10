import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { promisify } from "node:util";
import { withRepoLock } from "./index.js";
import { withGitIdentity } from "./checkpoints.js";
import { listWorkItemWorktrees } from "./worktrees.js";

const execute = promisify(execFile);
const gitAt = (root: string) => async (args: string[]) =>
  (await execute("git", args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })).stdout;

async function mainCheckoutBranch(root: string) {
  const git = gitAt(root);
  const branch = (await git(["symbolic-ref", "--short", "HEAD"])).trim();
  const registry = (await git(["worktree", "list", "--porcelain", "-z"])).split("\0")[0];
  let target = branch;
  for (const candidate of ["main", "master"]) {
    const exists = await git(["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`]).then(
      () => true,
      (error: { code?: number }) => {
        if (error.code !== 1) throw error;
        return false;
      },
    );
    if (exists) {
      target = candidate;
      break;
    }
  }
  if (
    registry !== `worktree ${await realpath(root)}` ||
    branch.startsWith("stintwork/") ||
    branch !== target
  )
    throw new LocalMergeRefusal("Merge locally requires the main checkout on its main branch.");
  return branch;
}

export type LocalMergeReport = {
  mainBranch: string;
  mainCommit: string;
  headCommit: string;
  tree: string;
  conflicts: string[];
  touchedPaths: string[];
};

export class LocalMergeRefusal extends Error {
  constructor(
    message: string,
    public conflicts: string[] = [],
    public paths: string[] = [],
  ) {
    super(message);
  }
}

export async function dryRunLocalMerge(root: string, slug: string): Promise<LocalMergeReport> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) throw new Error("Invalid work item slug.");
  const git = gitAt(root);
  const mainBranch = await mainCheckoutBranch(root);
  const worktree = listWorkItemWorktrees(root).worktrees.get(slug);
  if (!worktree) throw new LocalMergeRefusal("The work item's worktree is unavailable.");
  const [mainCommit, headCommit] = await Promise.all(
    ["HEAD", `refs/heads/${worktree.branch}`].map(async (ref) =>
      (await git(["rev-parse", "--verify", `${ref}^{commit}`])).trim(),
    ),
  );
  const output = await git([
    "merge-tree",
    "--write-tree",
    "--name-only",
    "--no-messages",
    "-z",
    mainCommit,
    headCommit,
  ]).catch((error: { code?: number; stdout?: string }) => {
    if (error.code !== 1 || !error.stdout) throw error;
    return error.stdout;
  });
  const [tree, ...fields] = output.split("\0");
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(tree))
    throw new Error("Cannot read the dry-run merge result.");
  const conflicts = fields.filter(Boolean);
  const touchedPaths = (
    await git(["diff", "--name-only", "--no-renames", "-z", mainCommit, tree, "--"])
  )
    .split("\0")
    .filter(Boolean);
  return { mainBranch, mainCommit, headCommit, tree, conflicts, touchedPaths };
}

export async function mergeLocalWorkItem(
  repoRoot: string,
  slug: string,
  recordMerge: (commit: string) => Promise<void>,
  beforeMerge: () => string | undefined = () => undefined,
): Promise<string> {
  const root = await realpath(repoRoot);
  return withRepoLock(root, async () => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) throw new Error("Invalid work item slug.");
    await mainCheckoutBranch(root);
    const recordedCommit = beforeMerge();
    const git = gitAt(root);
    if (recordedCommit && !listWorkItemWorktrees(root).worktrees.has(slug)) {
      await git(["merge-base", "--is-ancestor", recordedCommit, "HEAD"]);
      const branch = `refs/heads/stintwork/${slug}`;
      const exists = await git(["show-ref", "--verify", "--quiet", branch]).then(
        () => true,
        (error: { code?: number }) => {
          if (error.code !== 1) throw error;
          return false;
        },
      );
      if (exists) {
        await git(["merge-base", "--is-ancestor", branch, recordedCommit]);
        await git(["branch", "-d", `stintwork/${slug}`]);
      }
      return recordedCommit;
    }
    const report = await dryRunLocalMerge(root, slug);
    if (report.conflicts.length)
      throw new LocalMergeRefusal(
        "Merge conflicts with the main branch. Send back to resolve them.",
        report.conflicts,
      );
    const worktree = listWorkItemWorktrees(root).worktrees.get(slug);
    if (!worktree) throw new LocalMergeRefusal("The work item's worktree is unavailable.");
    if ((await gitAt(worktree.path)(["status", "--porcelain", "--untracked-files=all"])).trim())
      throw new LocalMergeRefusal("Commit worktree changes before merging locally.");
    for (const state of [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "rebase-merge",
      "rebase-apply",
    ]) {
      const path = (await git(["rev-parse", "--path-format=absolute", "--git-path", state])).trim();
      if (
        await lstat(path).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return undefined;
        })
      )
        throw new LocalMergeRefusal(
          "Finish the main checkout's pending Git operation before merging.",
        );
    }
    const protectedPaths = [...report.touchedPaths, `.scratch/${slug}/workflow.yaml`];
    const dirty = (
      await Promise.all(
        [[], ["--cached"]].map((options) =>
          git(["diff", ...options, "--name-only", "--no-renames", "-z", "--"]),
        ),
      )
    ).flatMap((output) => output.split("\0").filter(Boolean));
    const protectedScopes = [
      ...new Set(
        protectedPaths.flatMap((path) => {
          const parts = path.split("/");
          return parts.map((_part, index) => parts.slice(0, index + 1).join("/"));
        }),
      ),
    ];
    const untracked = (
      await git(["--literal-pathspecs", "ls-files", "--others", "-z", "--", ...protectedScopes])
    )
      .split("\0")
      .filter(Boolean);
    const overlaps = [...new Set([...dirty, ...untracked])].filter((path) =>
      protectedPaths.some(
        (target) =>
          path === target || path.startsWith(`${target}/`) || target.startsWith(`${path}/`),
      ),
    );
    if (overlaps.length)
      throw new LocalMergeRefusal(
        "The main checkout has uncommitted changes to files this merge touches.",
        [],
        overlaps,
      );
    let commit = recordedCommit;
    if (commit) {
      await git(["merge-base", "--is-ancestor", commit, "HEAD"]);
      await git(["merge-base", "--is-ancestor", report.headCommit, commit]);
    } else {
      const fastForward = await git([
        "merge-base",
        "--is-ancestor",
        report.mainCommit,
        report.headCommit,
      ]).then(
        () => true,
        (error: { code?: number }) => {
          if (error.code !== 1) throw error;
          return false;
        },
      );
      const alreadyMerged = await git([
        "merge-base",
        "--is-ancestor",
        report.headCommit,
        report.mainCommit,
      ]).then(
        () => true,
        (error: { code?: number }) => {
          if (error.code !== 1) throw error;
          return false;
        },
      );
      commit = fastForward
        ? report.headCommit
        : alreadyMerged
          ? report.mainCommit
          : (
              await withGitIdentity(git, [
                "commit-tree",
                report.tree,
                "-p",
                report.mainCommit,
                "-p",
                report.headCommit,
                "-m",
                `Merge work item ${slug}`,
              ])
            ).trim();
      if (
        (await git(["rev-parse", "HEAD"])).trim() !== report.mainCommit ||
        (await git(["rev-parse", `refs/heads/${worktree.branch}`])).trim() !== report.headCommit
      )
        throw new LocalMergeRefusal("The branches changed during the merge. Try again.");
      await git(["merge", "--ff-only", "--no-overwrite-ignore", commit]);
      try {
        await recordMerge(commit);
      } catch (error) {
        throw new Error(
          `Merged at ${commit}, but recording failed; worktree and branch retained. Retry Merge locally. ${String(error)}`,
        );
      }
    }
    try {
      await git(["worktree", "remove", worktree.path]);
      await git(["branch", "-d", worktree.branch]);
    } catch (error) {
      throw new Error(`Merge recorded at ${commit}, but cleanup failed. ${String(error)}`);
    }
    return commit;
  });
}
