import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

async function commitWithIdentity(git: (args: string[]) => Promise<string>, args: string[]) {
  const identity = await Promise.all(
    ["name", "email"].map((field) =>
      git(["config", "--get", `user.${field}`]).catch((error: { code?: number }) => {
        if (error.code !== 1) throw error;
        return "";
      }),
    ),
  );
  const name = identity[0] || "Stintwork";
  const email = identity[1] || "stintwork@localhost";
  await git([
    "-c",
    `user.name=${name}`,
    "-c",
    `user.email=${email}`,
    "commit",
    "--author",
    `${name} <${email}>`,
    ...args,
  ]);
}

export async function commitStintworkSetup(
  worktree: string,
  workItem: string,
  files: readonly string[],
): Promise<string | null> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(workItem)) throw new Error("Invalid work item slug.");
  const allowed = new Set([".gitignore", `.scratch/${workItem}/workflow.yaml`]);
  if (files.some((file) => !allowed.has(file))) throw new Error("Invalid Stintwork setup file.");
  if (!files.length) return null;

  const git = async (args: string[]) =>
    (await execute("git", args, { cwd: worktree })).stdout.trim();
  const changed = await git(["status", "--porcelain=v1", "--untracked-files=all", "--", ...files]);
  if (!changed) return null;
  await git(["add", "--", ...files]);
  await commitWithIdentity(git, [
    "--only",
    "-m",
    `Stintwork setup for work item ${workItem}`,
    "--",
    ...files,
  ]);
  return git(["rev-parse", "HEAD"]);
}

export async function createCheckpoint(
  worktree: string,
  stint: { id: string; workItem: string; ticket: number | null; status: string },
): Promise<string> {
  const git = async (args: string[]) =>
    (await execute("git", args, { cwd: worktree })).stdout.trim();
  await git(["add", "--all"]);
  const changed = await git(["diff", "--cached", "--quiet"]).then(
    () => false,
    (error: { code?: number }) => {
      if (error.code !== 1) throw error;
      return true;
    },
  );
  if (changed) {
    await commitWithIdentity(git, [
      "-m",
      `Checkpoint: stint ${stint.id}; work item ${stint.workItem}; ticket ${stint.ticket ?? "none"}; ${stint.status}`,
    ]);
  }
  return git(["rev-parse", "HEAD"]);
}

export async function changedSince(
  root: string,
  checkpointCommit: string,
  workItem: string,
): Promise<string[]> {
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(checkpointCommit))
    throw new Error("Invalid checkpoint commit.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(workItem)) throw new Error("Invalid work item slug.");
  const prefix = `.scratch/${workItem}/`;
  const paths = [`${prefix}spec.md`, `${prefix}issues/`];
  const outputs = await Promise.all(
    [
      ["diff", "--name-only", "--no-renames", "-z", checkpointCommit, "--", ...paths],
      ["ls-files", "--others", "--exclude-standard", "-z", "--", ...paths],
    ].map((args) => execute("git", ["--literal-pathspecs", ...args], { cwd: root })),
  );
  return [...new Set(outputs.flatMap(({ stdout }) => stdout.split("\0")))]
    .filter(
      (path) =>
        path === `${prefix}spec.md` ||
        (path.startsWith(`${prefix}issues/`) &&
          /^\d{2,}-[^/]+\.md$/.test(path.slice(`${prefix}issues/`.length))),
    )
    .sort();
}
