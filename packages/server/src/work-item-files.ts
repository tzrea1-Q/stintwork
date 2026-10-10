import { join } from "node:path";
import { composeWorkItemFiles, type RepoFiles, type Warning } from "@stintwork/core";
import { listWorkItemWorktrees, workItemFilesDiverged } from "@stintwork/git";
import { createNodeRepoFiles, projectPaths } from "./repo-files.js";

/** The server owns Git/filesystem discovery; core consumes only the composed read-only port. */
export function readProjectFiles(root: string, main: RepoFiles = createNodeRepoFiles(root)) {
  const warnings: Warning[] = [];
  const overlays = new Map<string, RepoFiles>();
  const worktreePaths = new Map<string, string>();
  const watchPaths = projectPaths.map((path) => join(root, path));
  try {
    const { worktrees, registryPath } = listWorkItemWorktrees(root);
    watchPaths.push(registryPath);
    for (const [slug, worktree] of worktrees) {
      overlays.set(slug, createNodeRepoFiles(worktree.path));
      worktreePaths.set(slug, worktree.path);
      watchPaths.push(join(worktree.path, ".scratch", slug));
      try {
        if (workItemFilesDiverged(root, slug))
          warnings.push({
            path: `.scratch/${slug}/`,
            message: `The main checkout's work item files differ from the worktree's base commit. Edit ${join(worktree.path, ".scratch", slug)} instead.`,
          });
      } catch (error) {
        warnings.push({
          path: `.scratch/${slug}/`,
          message: `Cannot check divergence: ${String(error)}`,
        });
      }
    }
  } catch (error) {
    warnings.push({ path: ".git", message: `Cannot discover worktrees: ${String(error)}` });
  }
  return { files: composeWorkItemFiles(main, overlays), worktreePaths, watchPaths, warnings };
}
