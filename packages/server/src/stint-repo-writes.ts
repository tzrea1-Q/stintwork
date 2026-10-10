import { appendFileSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { firstStintWorkflow, type StagedWorkItem, type StageId } from "@stintwork/core";

export function ensureLocalIgnore(root: string): boolean {
  const path = join(root, ".gitignore");
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.isSymbolicLink()))
    throw new Error(".gitignore must be a regular file.");
  const ignore = stat ? readFileSync(path, "utf8") : "";
  if (
    ignore
      .split(/\r?\n/)
      .some((line) => line === ".stintwork/local/" || line === "/.stintwork/local/")
  )
    return false;
  appendFileSync(path, `${ignore && !ignore.endsWith("\n") ? "\n" : ""}.stintwork/local/\n`);
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
      throw new Error("Work item directories must be real directories.");
  }
  const path = join(directory, "workflow.yaml");
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat) {
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("workflow.yaml must be a regular file.");
  }
  const existing = stat ? readFileSync(path, "utf8") : undefined;
  const workflow = firstStintWorkflow(existing, workItem.workflow, stage, agent);
  if (workflow === existing) return false;
  writeFileSync(path, workflow, { flag: stat ? "w" : "wx" });
  return true;
}
