// SPDX-License-Identifier: Apache-2.0
import { CoreTextError } from "@stintwork/core";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitWithIdentity } from "./checkpoints.js";
import { withRepoLock } from "./index.js";

export class WorkflowCustomisationRefusal extends CoreTextError {}

function git(root: string, args: string[]) {
  return execFileSync("git", ["--literal-pathspecs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function checkWorkflowCustomisation(root: string, id: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    throw new WorkflowCustomisationRefusal({ code: "workflow.invalidId" });
  const relative = `.stintwork/workflows/${id}.yaml`;
  for (const parent of [".stintwork", ".stintwork/workflows"]) {
    const stat = lstatSync(join(root, parent), { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
      throw new WorkflowCustomisationRefusal(`${parent} must be a real directory.`);
  }
  if (git(root, ["status", "--porcelain=v1", "--untracked-files=all", "--", relative]))
    throw new WorkflowCustomisationRefusal(`Commit or discard hand edits to ${relative} first.`);
  if (
    lstatSync(join(root, relative), { throwIfNoEntry: false }) ||
    git(root, ["ls-files", "--", relative])
  )
    throw new WorkflowCustomisationRefusal(`Workflow file ${relative} already exists.`);
  return relative;
}

export function commitWorkflowCustomisation(root: string, id: string, yaml: string) {
  return withRepoLock(root, async () => {
    const relative = checkWorkflowCustomisation(root, id);
    const path = join(root, relative);
    mkdirSync(join(root, ".stintwork/workflows"), { recursive: true });
    writeFileSync(path, yaml, { flag: "wx" });
    try {
      git(root, ["add", "--", relative]);
      await commitWithIdentity(
        async (args) => git(root, args),
        ["--only", "-m", `Customise workflow ${id}`, "--", relative],
      );
    } catch (error) {
      const stat = lstatSync(path, { throwIfNoEntry: false });
      if (stat?.isFile() && !stat.isSymbolicLink() && readFileSync(path, "utf8") === yaml)
        rmSync(path);
      git(root, ["update-index", "--force-remove", "--", relative]);
      throw error;
    }
    return { id, path: relative, commit: git(root, ["rev-parse", "HEAD"]) };
  });
}
