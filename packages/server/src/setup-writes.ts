// SPDX-License-Identifier: Apache-2.0
import {
  CoreTextError,
  planSetup,
  setupPaths,
  type RepoFiles,
  type SetupChange,
} from "@stintwork/core";
import { execFile, execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { commitWithIdentity, withRepoLock } from "@stintwork/git";

export class SetupWriteRefusal extends CoreTextError {}

const execute = promisify(execFile);

function target(root: string, path: string) {
  let absolute = root;
  const parts = path.split("/");
  for (const [index, part] of parts.entries()) {
    absolute = join(absolute, part);
    const stat = lstatSync(absolute, { throwIfNoEntry: false });
    if (
      stat &&
      (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()))
    )
      throw new SetupWriteRefusal(
        `${path} must be a regular file inside real project directories.`,
      );
  }
  return absolute;
}

export function applySetup(root: string, files: RepoFiles, selected: readonly SetupChange[]) {
  return withRepoLock(root, async () => {
    if (
      !selected.length ||
      new Set(selected.map(({ path }) => path)).size !== selected.length ||
      selected.some(({ path }) => !setupPaths.includes(path))
    )
      throw new CoreTextError({ code: "setup.distinctFiles" });
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    const plan = planSetup(files);
    const entries = selected.map((change) => {
      const path = target(root, change.path);
      const proposal = plan.changes.find(({ path }) => path === change.path);
      if (!proposal || proposal.before !== change.before || proposal.content !== change.content)
        throw new SetupWriteRefusal(`Setup preview changed for ${change.path}. Reopen the guide.`);
      const stat = lstatSync(path, { throwIfNoEntry: false });
      const indexEntry = git(["ls-files", "--stage", "--", change.path]);
      const tracked = Boolean(indexEntry);
      if (
        git(["status", "--porcelain=v1", "--untracked-files=all", "--", change.path]) ||
        (stat && !tracked) ||
        (tracked && !stat) ||
        (stat &&
          tracked &&
          git(["hash-object", `--path=${change.path}`, path]) !==
            git(["rev-parse", `HEAD:${change.path}`]))
      )
        throw new SetupWriteRefusal(
          `Commit or discard uncommitted changes to ${change.path} before setup.`,
        );
      if (!tracked) {
        try {
          git(["check-ignore", "-q", "--", change.path]);
          throw new SetupWriteRefusal(
            `${change.path} is ignored. Change the ignore rule before setup.`,
          );
        } catch (error) {
          if (!(error && typeof error === "object" && "status" in error && error.status === 1))
            throw error;
        }
      }
      return { change, path, indexEntry };
    });
    const written: typeof entries = [];
    const createdDirectories: string[] = [];
    try {
      for (const entry of entries) {
        const missing: string[] = [];
        let directory = dirname(entry.path);
        while (directory !== root && !lstatSync(directory, { throwIfNoEntry: false })) {
          missing.unshift(directory);
          directory = dirname(directory);
        }
        for (const directory of missing) {
          mkdirSync(directory);
          createdDirectories.push(directory);
        }
        target(root, entry.change.path);
        const current = lstatSync(entry.path, { throwIfNoEntry: false })
          ? readFileSync(entry.path, "utf8")
          : null;
        if (current !== entry.change.before)
          throw new SetupWriteRefusal(
            `Setup preview changed for ${entry.change.path}. Reopen the guide.`,
          );
        writeFileSync(entry.path, entry.change.content, {
          flag: entry.change.before === null ? "wx" : "w",
        });
        written.push(entry);
      }
      const paths = entries.map(({ change }) => change.path);
      git(["add", "--", ...paths]);
      await commitWithIdentity(
        async (args) => (await execute("git", args, { cwd: root })).stdout.trim(),
        ["--only", "-m", "Set up Stintwork", "--", ...paths],
      );
    } catch (error) {
      for (const { change, path, indexEntry } of written.reverse()) {
        target(root, change.path);
        if (
          lstatSync(path, { throwIfNoEntry: false })?.isFile() &&
          readFileSync(path, "utf8") === change.content
        ) {
          if (change.before === null) rmSync(path);
          else writeFileSync(path, change.before);
        }
        if (indexEntry) {
          const [mode, hash] = indexEntry.split(" ");
          git(["update-index", "--cacheinfo", `${mode},${hash},${change.path}`]);
        } else git(["update-index", "--force-remove", "--", change.path]);
      }
      for (const directory of createdDirectories.reverse()) {
        try {
          rmdirSync(directory);
        } catch {}
      }
      throw error;
    }
    return git(["rev-parse", "HEAD"]);
  });
}
