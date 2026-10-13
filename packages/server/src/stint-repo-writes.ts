// SPDX-License-Identifier: Apache-2.0
import {
  CoreTextError,
  firstStintWorkflow,
  type StagedWorkItem,
  type StageId,
} from "@stintwork/core";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function ensureLocalIgnore(root: string): boolean {
  let directory = root;
  for (const part of [".stintwork", "local"]) {
    directory = join(directory, part);
    const stat = lstatSync(directory, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
      throw new CoreTextError({ code: "server.localDirectories" });
    if (!stat) mkdirSync(directory);
  }
  const path = join(directory, ".gitignore");
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.isSymbolicLink()))
    throw new CoreTextError({ code: "server.localIgnoreRegular" });
  if (stat && readFileSync(path, "utf8") === "*\n") return false;
  writeFileSync(path, "*\n", { flag: stat ? "w" : "wx" });
  return true;
}

export function writeFirstStintWorkflow(
  root: string,
  workItem: Pick<StagedWorkItem, "slug" | "workflow">,
  stage: StageId,
  agent: string,
): boolean {
  let directory = root;
  for (const part of [".scratch", workItem.slug]) {
    directory = join(directory, part);
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new CoreTextError({ code: "server.workItemDirectories" });
  }
  const path = join(directory, "workflow.yaml");
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat) {
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new CoreTextError({ code: "workflow.regularFile" });
  }
  const existing = stat ? readFileSync(path, "utf8") : undefined;
  const workflow = firstStintWorkflow(existing, workItem.workflow, stage, agent);
  if (workflow === existing) return false;
  writeFileSync(path, workflow, { flag: stat ? "w" : "wx" });
  return true;
}
