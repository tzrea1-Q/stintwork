// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type DiffLine = {
  kind: "context" | "added" | "removed";
  oldLine: number | null;
  newLine: number | null;
  text: string;
  noNewline?: boolean;
};
export type DiffHunk = {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
};
export type DiffFile = {
  path: string;
  oldPath?: string;
  status: "added" | "removed" | "modified" | "renamed" | "type-changed";
  additions: number | null;
  deletions: number | null;
  binary: boolean;
  hunks: DiffHunk[];
};
export type WorkItemDiff = {
  branch: string;
  mainBranch: string;
  mainCommit: string;
  mergeBase: string;
  headCommit: string;
  files: DiffFile[];
};

const execute = promisify(execFile);

function parseHunks(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let hunk: DiffHunk | undefined;
  let oldLine = 0;
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (match) {
      hunk = {
        header: line,
        oldStart: Number(match[1]),
        oldCount: Number(match[2] ?? 1),
        newStart: Number(match[3]),
        newCount: Number(match[4] ?? 1),
        lines: [],
      };
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      hunks.push(hunk);
    } else if (hunk && line.startsWith("\\")) {
      const previous = hunk.lines.at(-1);
      if (previous) previous.noNewline = true;
    } else if (hunk && [" ", "+", "-"].includes(line[0])) {
      hunk.lines.push({
        kind: line[0] === "+" ? "added" : line[0] === "-" ? "removed" : "context",
        oldLine: line[0] === "+" ? null : oldLine++,
        newLine: line[0] === "-" ? null : newLine++,
        text: line.slice(1),
      });
    }
  }
  return hunks;
}

/** The repository's main branch: `main` if it exists, otherwise `master`, otherwise null. */
export async function defaultMainBranch(repoRoot: string): Promise<string | null> {
  for (const candidate of ["main", "master"]) {
    const exists = await execute(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`],
      { cwd: repoRoot },
    ).then(
      () => true,
      (error: { code?: number }) => {
        if (error.code !== 1) throw error;
        return false;
      },
    );
    if (exists) return candidate;
  }
  return null;
}

export async function workItemDiff(
  repoRoot: string,
  slug: string,
  requestedMainBranch?: string,
): Promise<WorkItemDiff> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) throw new Error("Invalid work item slug.");
  const mainBranch = requestedMainBranch ?? (await defaultMainBranch(repoRoot));
  if (!mainBranch) throw new Error("Cannot find the main branch: neither main nor master exists.");
  const git = async (args: string[]) =>
    (
      await execute("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 10_000,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      })
    ).stdout;
  const branch = `stintwork/${slug}`;
  await git(["check-ref-format", `refs/heads/${mainBranch}`]);
  const [mainCommit, headCommit] = await Promise.all(
    [mainBranch, branch].map(async (ref) =>
      (await git(["rev-parse", "--verify", `refs/heads/${ref}^{commit}`])).trim(),
    ),
  );
  const mergeBase = (await git(["merge-base", mainCommit, headCommit])).trim();
  const diffArgs = [
    "-c",
    "diff.suppressBlankEmpty=false",
    "--literal-pathspecs",
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--no-relative",
    "--ignore-submodules=none",
    "--submodule=short",
    "--find-renames=50%",
  ];
  const [names, counts] = await Promise.all(
    ["--name-status", "--numstat"].map((format) =>
      git([...diffArgs, format, "-z", mergeBase, headCommit, "--"]),
    ),
  );
  const stats = new Map<string, Pick<DiffFile, "additions" | "deletions" | "binary">>();
  const countFields = counts.split("\0");
  for (let index = 0; index < countFields.length - 1; index++) {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(countFields[index]);
    if (!match) throw new Error("Cannot read Git diff counts.");
    let path = match[3];
    if (!path) {
      index += 2;
      path = countFields[index];
    }
    stats.set(path, {
      additions: match[1] === "-" ? null : Number(match[1]),
      deletions: match[2] === "-" ? null : Number(match[2]),
      binary: match[1] === "-" || match[2] === "-",
    });
  }
  const files: DiffFile[] = [];
  const nameFields = names.split("\0");
  const statuses = {
    A: "added",
    D: "removed",
    M: "modified",
    R: "renamed",
    T: "type-changed",
  } as const;
  for (let index = 0; index < nameFields.length - 1; index++) {
    const code = nameFields[index][0] as keyof typeof statuses;
    const status = statuses[code];
    if (!status) throw new Error("Unsupported Git diff status.");
    const originalPath = nameFields[++index];
    const path = code === "R" ? nameFields[++index] : originalPath;
    const stat = stats.get(path);
    if (!stat) throw new Error("Missing Git diff counts.");
    files.push({
      path,
      ...(code === "R" ? { oldPath: originalPath } : {}),
      status,
      ...stat,
      hunks:
        code === "R" || stat.binary
          ? []
          : parseHunks(
              await git([
                ...diffArgs,
                "--no-renames",
                "--patch",
                "--unified=3",
                mergeBase,
                headCommit,
                "--",
                path,
              ]),
            ),
    });
  }
  return { branch, mainBranch, mainCommit, mergeBase, headCommit, files };
}
