import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitStintworkSetup } from "@stintwork/git";

export function writeWorkItemWorkflow(
  root: string,
  slug: string,
  update: (existing: string | undefined) => string,
): boolean {
  let directory = root;
  for (const part of [".scratch", slug]) {
    directory = join(directory, part);
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Work item directories must be real directories.");
  }
  const path = join(directory, "workflow.yaml");
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.isSymbolicLink()))
    throw new Error("workflow.yaml must be a regular file.");
  const existing = stat ? readFileSync(path, "utf8") : undefined;
  const text = update(existing);
  if (text === existing) return false;
  writeFileSync(path, text, { flag: stat ? "w" : "wx" });
  return true;
}

export async function saveWorkItemWorkflow(
  root: string,
  slug: string,
  update: (existing: string | undefined) => string,
  commit: boolean,
) {
  const relative = `.scratch/${slug}/workflow.yaml`;
  const path = join(root, relative);
  let existing: string | undefined;
  let written = "";
  let indexEntry = "";
  const changed = writeWorkItemWorkflow(root, slug, (text) => {
    existing = text;
    written = update(text);
    if (commit) {
      indexEntry = execFileSync("git", ["ls-files", "--stage", "--", relative], {
        cwd: root,
        encoding: "utf8",
      }).trim();
      if (indexEntry && !/^\d+ [a-f\d]+ 0\t[^\n]+$/.test(indexEntry))
        throw new Error("Resolve workflow.yaml's index conflict before changing it.");
    }
    return written;
  });
  if (!commit) return null;
  try {
    return await commitStintworkSetup(root, slug, [relative]);
  } catch (error) {
    if (changed && readFileSync(path, "utf8") === written) {
      if (existing === undefined) rmSync(path);
      else writeFileSync(path, existing);
    }
    if (indexEntry) {
      const [mode, hash] = indexEntry.split(" ");
      execFileSync("git", ["update-index", "--cacheinfo", `${mode},${hash},${relative}`], {
        cwd: root,
      });
    } else execFileSync("git", ["update-index", "--force-remove", "--", relative], { cwd: root });
    throw error;
  }
}
