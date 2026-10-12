// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";

export type RiskyPath = {
  path: string;
  reasons: ("likely-secret" | "large-file" | "generated-directory")[];
  blob: string;
};

export function riskyPathReasons(path: string, size: number): RiskyPath["reasons"] {
  const reasons: RiskyPath["reasons"] = [];
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
  if (size > 1024 * 1024) reasons.push("large-file");
  if (
    path
      .split("/")
      .slice(0, -1)
      .some((part) => ["node_modules", "dist", "build", "coverage"].includes(part))
  )
    reasons.push("generated-directory");
  return reasons;
}

function git(root: string, args: string[], input?: string) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
    timeout: 10_000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    input,
  });
}

function commitRef(commit: string) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) throw new Error("Invalid commit.");
  return commit;
}

/** Read only path, object identity and size; never read blob contents. */
export function scanRiskyPaths(root: string, base: string | null, head: string): RiskyPath[] {
  const fields = git(root, [
    ...(base === null ? ["diff-tree", "--root", "--no-commit-id", "-r"] : ["diff"]),
    "--raw",
    "--no-abbrev",
    "--no-renames",
    "--no-ext-diff",
    "--no-textconv",
    "--diff-filter=AMT",
    "-z",
    ...(base === null ? [] : [commitRef(base)]),
    commitRef(head),
    "--",
  ]).split("\0");
  const paths: { path: string; blob: string }[] = [];
  for (let index = 0; index < fields.length - 1; index += 2) {
    const metadata = /^:\d+ \d+ [a-f0-9]+ ([a-f0-9]+) [AMT]$/.exec(fields[index]);
    if (!metadata) throw new Error("Cannot read risky path metadata.");
    paths.push({ path: fields[index + 1], blob: metadata[1] });
  }
  const sizes = paths.length
    ? git(
        root,
        ["cat-file", "--batch-check=%(objectsize)"],
        `${paths.map(({ blob }) => blob).join("\n")}\n`,
      )
        .trim()
        .split("\n")
    : [];
  return paths.flatMap(({ path, blob }, index): RiskyPath[] => {
    const size = Number(sizes[index]);
    if (!Number.isFinite(size)) throw new Error("Cannot read risky path size.");
    const reasons = riskyPathReasons(path, size);
    return reasons.length ? [{ path, reasons, blob }] : [];
  });
}

export function committedRiskyPaths(root: string, base: string, head = "HEAD") {
  const warnings = new Map<
    string,
    {
      path: string;
      reasons: RiskyPath["reasons"];
      excluded: false;
      committed: true;
      commits: string[];
    }
  >();
  const target =
    head === "HEAD" ? git(root, ["rev-parse", "--verify", "HEAD"]).trim() : commitRef(head);
  const commits = git(root, [
    "rev-list",
    "--reverse",
    "--parents",
    `${commitRef(base)}..${target}`,
    "--",
  ]).trim();
  for (const entry of commits ? commits.split("\n") : []) {
    const [commit, ...parents] = entry.split(" ");
    for (const parent of parents.length ? parents : [null]) {
      for (const { path, reasons } of scanRiskyPaths(root, parent, commit)) {
        const warning = warnings.get(path) ?? {
          path,
          reasons: [],
          excluded: false,
          committed: true,
          commits: [],
        };
        warning.reasons = [...new Set([...warning.reasons, ...reasons])];
        if (!warning.commits.includes(commit)) warning.commits.push(commit);
        warnings.set(path, warning);
      }
    }
  }
  return [...warnings.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function branchRiskyPaths(root: string, slug: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) throw new Error("Invalid work item slug.");
  let main = "HEAD";
  for (const candidate of ["main", "master"]) {
    try {
      git(root, ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`]);
      main = `refs/heads/${candidate}`;
      break;
    } catch (error) {
      if ((error as { status?: number }).status !== 1) throw error;
    }
  }
  const head = git(root, ["rev-parse", "--verify", `refs/heads/stintwork/${slug}^{commit}`]).trim();
  const base = git(root, ["merge-base", main, head]).trim();
  return scanRiskyPaths(root, base, head);
}
