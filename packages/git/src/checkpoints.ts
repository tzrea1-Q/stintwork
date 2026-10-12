// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

export type CheckpointWarning = {
  path: string;
  reasons: ("likely-secret" | "large-file" | "generated-directory")[];
  excluded: true;
};

export async function withGitIdentity(git: (args: string[]) => Promise<string>, args: string[]) {
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
  return git([
    "-c",
    `user.name=${name}`,
    "-c",
    `user.email=${email}`,
    ...(args[0] === "commit"
      ? ["commit", "--author", `${name} <${email}>`, ...args.slice(1)]
      : args),
  ]);
}

export async function commitWithIdentity(git: (args: string[]) => Promise<string>, args: string[]) {
  return withGitIdentity(git, ["commit", ...args]);
}

export async function commitStintworkSetup(
  worktree: string,
  workItem: string,
  files: readonly string[],
  message = `Stintwork setup for work item ${workItem}`,
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
  await commitWithIdentity(git, ["--only", "-m", message, "--", ...files]);
  return git(["rev-parse", "HEAD"]);
}

export async function createCheckpoint(
  worktree: string,
  stint: { id: string; workItem: string; ticket: number | null; status: string },
  onWarnings?: (warnings: CheckpointWarning[]) => void,
): Promise<string> {
  const git = async (args: string[], input?: string) => {
    const execution = execute("git", args, { cwd: worktree, maxBuffer: 16 * 1024 * 1024 });
    if (input !== undefined) execution.child.stdin?.end(input);
    const { stdout } = await execution;
    return args.includes("-z") ? stdout : stdout.trim();
  };
  const stagedPaths = new Set(
    (await git(["diff", "--cached", "--name-only", "--no-renames", "-z", "HEAD", "--"]))
      .split("\0")
      .filter(Boolean),
  );
  const outputs = await Promise.all([
    git(["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"]),
    git(["ls-files", "--others", "--exclude-standard", "-z"]),
    git(["diff", "--name-only", "--no-renames", "-z", "--"]),
  ]);
  const pending = new Set(outputs.slice(1).flatMap((output) => output.split("\0").filter(Boolean)));
  const paths = [
    ...new Set([
      ...stagedPaths,
      ...outputs.flatMap((output) => output.split("\0").filter(Boolean)),
    ]),
  ].sort();
  const warnings: CheckpointWarning[] = [];
  for (const path of paths) {
    const stat = await lstat(join(worktree, path)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    const stagedSize = stagedPaths.has(path)
      ? await git(["cat-file", "-s", `:${path}`])
          .then(Number)
          .catch((error: { code?: number }) => {
            if (error.code !== 128) throw error;
            return undefined;
          })
      : undefined;
    if (!stat && stagedSize === undefined) continue;
    const reasons: CheckpointWarning["reasons"] = [];
    // ponytail: filename heuristics, not a content scanner; use a dedicated scanner if stronger detection is needed.
    if (
      path
        .split("/")
        .some((part) =>
          /^(?:\.env|id_rsa)|\.(?:pem|key)$|(?:^|[._-])(?:credentials?|tokens?|secrets?)(?:$|[._-])/i.test(
            part,
          ),
        )
    )
      reasons.push("likely-secret");
    if (Math.max(stat?.size ?? 0, stagedSize ?? 0) > 1024 * 1024) reasons.push("large-file");
    if (
      path
        .split("/")
        .slice(0, -1)
        .some((part) => ["node_modules", "dist", "build", "coverage"].includes(part))
    )
      reasons.push("generated-directory");
    if (reasons.length) warnings.push({ path, reasons, excluded: true });
  }
  onWarnings?.(warnings);
  const excluded = new Set(warnings.map(({ path }) => path));
  const safe = paths.filter((path) => pending.has(path) && !excluded.has(path));
  if (safe.length)
    await git(
      ["--literal-pathspecs", "add", "--all", "--pathspec-from-file=-", "--pathspec-file-nul"],
      `${safe.join("\0")}\0`,
    );
  const changed = (
    await git(["diff", "--cached", "--name-only", "--no-renames", "-z", "HEAD", "--"])
  )
    .split("\0")
    .filter((path) => path && !excluded.has(path));
  if (changed.length) {
    await commitWithIdentity(
      (args) =>
        git(
          ["--literal-pathspecs", ...args],
          args.includes("commit") ? `${changed.join("\0")}\0` : undefined,
        ),
      [
        "--only",
        "--pathspec-from-file=-",
        "--pathspec-file-nul",
        "-m",
        `Checkpoint: stint ${stint.id}; work item ${stint.workItem}; ticket ${stint.ticket ?? "none"}; ${stint.status}`,
      ],
    );
  }
  return (await git(["rev-parse", "HEAD"])).trim();
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
