import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitWithIdentity } from "./checkpoints.js";
import { withRepoLock } from "./index.js";

export class RoadmapWriteRefusal extends Error {}

export function commitRoadmap(
  root: string,
  update: (text: string) => { text: string; message: string },
): Promise<string | null> {
  return withRepoLock(root, async () => {
    const relative = ".stintwork/roadmap.md";
    const directory = join(root, ".stintwork");
    const path = join(root, relative);
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    const parent = lstatSync(directory, { throwIfNoEntry: false });
    if (parent && (!parent.isDirectory() || parent.isSymbolicLink()))
      throw new RoadmapWriteRefusal(".stintwork must be a real directory.");
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat && (!stat.isFile() || stat.isSymbolicLink()))
      throw new RoadmapWriteRefusal("roadmap.md must be a regular file.");
    const tracked = git(["ls-files", "--", relative]);
    if (
      git(["status", "--porcelain=v1", "--untracked-files=all", "--", relative]) ||
      (stat && !tracked) ||
      (stat &&
        tracked &&
        git(["hash-object", `--path=${relative}`, path]) !== git(["rev-parse", `HEAD:${relative}`]))
    )
      throw new RoadmapWriteRefusal(
        "Commit or discard hand edits to roadmap.md before changing the roadmap.",
      );
    const original = stat ? readFileSync(path, "utf8") : undefined;
    const edited = update(original ?? "");
    if (edited.text === (original ?? "")) return null;
    if (!parent) mkdirSync(directory);
    writeFileSync(path, edited.text, { flag: stat ? "w" : "wx" });
    try {
      git(["add", "--", relative]);
      await commitWithIdentity(
        async (args) => git(args),
        ["--only", "-m", edited.message, "--", relative],
      );
    } catch (error) {
      if (
        lstatSync(path, { throwIfNoEntry: false })?.isFile() &&
        readFileSync(path, "utf8") === edited.text
      ) {
        if (original === undefined) rmSync(path);
        else writeFileSync(path, original);
      }
      if (tracked) git(["reset", "-q", "HEAD", "--", relative]);
      else git(["update-index", "--force-remove", "--", relative]);
      throw error;
    }
    return git(["rev-parse", "HEAD"]);
  });
}
