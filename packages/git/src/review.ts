// SPDX-License-Identifier: Apache-2.0
import { execFile, execFileSync } from "node:child_process";
import { lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { commitWithIdentity } from "./checkpoints.js";

const execute = promisify(execFile);

function commitRef(commit: string) {
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(commit)) throw new Error("Invalid commit.");
  return commit;
}

function gitText(root: string, args: string[]) {
  return execFileSync("git", ["--literal-pathspecs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

export function checkpointChangedPaths(root: string, base: string, checkpoint: string): string[] {
  return gitText(root, [
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    commitRef(base),
    commitRef(checkpoint),
    "--",
  ])
    .split("\0")
    .filter(Boolean);
}

export function checkpointFileDiff(
  root: string,
  base: string,
  checkpoint: string,
  path: string,
): string {
  return gitText(root, [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--no-renames",
    commitRef(base),
    commitRef(checkpoint),
    "--",
    path,
  ]);
}

function regularPath(root: string, relative: string) {
  let path = root;
  const parts = relative.split("/");
  for (const [position, part] of parts.entries()) {
    path = join(path, part);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (
      stat &&
      (stat.isSymbolicLink() ||
        (position < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()))
    )
      throw new Error("Review and project memory paths must be regular files in real directories.");
  }
}

export async function commitWorkItemReview(
  worktree: string,
  slug: string,
  text: string,
  message: string,
  rejection?: { path: string; baseCommit: string },
  workflow?: string,
): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) throw new Error("Invalid work item slug.");
  if (gitText(worktree, ["symbolic-ref", "--short", "HEAD"]).trim() !== `stintwork/${slug}`)
    throw new Error("The worktree is not on the work item's branch.");
  const review = `.scratch/${slug}/review.yaml`;
  const paths = [review];
  if (workflow !== undefined) paths.push(`.scratch/${slug}/workflow.yaml`);
  if (rejection) {
    if (
      !/^(?:GLOSSARY\.md|AGENTS\.md|CLAUDE\.md|docs\/(?:adr|agents)\/.+)$/.test(rejection.path) ||
      rejection.path.includes("\\") ||
      rejection.path.includes("\0") ||
      rejection.path.split("/").some((part) => !part || part === "." || part === "..")
    )
      throw new Error("Invalid project memory path.");
    commitRef(rejection.baseCommit);
    paths.push(rejection.path);
  }
  for (const path of paths) regularPath(worktree, path);
  if (
    gitText(worktree, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--ignored=matching",
      "--",
      ...paths,
    ])
  )
    throw new Error("Commit or discard changes to the review or proposed file before deciding.");
  const head = gitText(worktree, ["rev-parse", "HEAD"]).trim();
  const existing = lstatSync(join(worktree, review), { throwIfNoEntry: false })
    ? readFileSync(join(worktree, review), "utf8")
    : undefined;
  const git = async (args: string[]) =>
    (await execute("git", ["--literal-pathspecs", ...args], { cwd: worktree })).stdout.trim();
  try {
    if (rejection) {
      const present = gitText(worktree, [
        "ls-tree",
        "-z",
        rejection.baseCommit,
        "--",
        rejection.path,
      ]);
      if (present) {
        if (!/^100(?:644|755) blob /.test(present))
          throw new Error("The base project memory file must be regular.");
        await git([
          "restore",
          "--source",
          rejection.baseCommit,
          "--worktree",
          "--",
          rejection.path,
        ]);
      } else rmSync(join(worktree, rejection.path), { force: true });
    }
    writeFileSync(join(worktree, review), text, { flag: existing === undefined ? "wx" : "w" });
    if (workflow !== undefined)
      writeFileSync(join(worktree, `.scratch/${slug}/workflow.yaml`), workflow);
    await git(["add", "--all", "--", ...paths]);
    await commitWithIdentity(git, ["--only", "-m", message, "--", ...paths]);
    return await git(["rev-parse", "HEAD"]);
  } catch (error) {
    if (gitText(worktree, ["rev-parse", "HEAD"]).trim() === head) {
      for (const path of paths) {
        if (gitText(worktree, ["ls-tree", "-z", head, "--", path]))
          await git(["restore", "--source", head, "--staged", "--worktree", "--", path]);
        else {
          await git(["update-index", "--force-remove", "--", path]);
          rmSync(join(worktree, path), { force: true });
        }
      }
    }
    throw error;
  }
}
