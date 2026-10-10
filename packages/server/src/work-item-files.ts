import { lstatSync, readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { composeWorkItemFiles, type RepoFiles, type Warning } from "@stintwork/core";
import { listWorkItemWorktrees, workItemBaseCommit, workItemFilesDiverged } from "@stintwork/git";
import { createNodeRepoFiles, projectPaths } from "./repo-files.js";

function within(path: string, scope: string) {
  return path === scope || path.startsWith(`${scope}${sep}`);
}

function worktreeExists(path: string) {
  try {
    return (
      lstatSync(path, { throwIfNoEntry: false })?.isDirectory() &&
      !lstatSync(dirname(path), { throwIfNoEntry: false })?.isSymbolicLink()
    );
  } catch {
    return false;
  }
}

function gitMetadataVersion(discovery: ReturnType<typeof listWorkItemWorktrees>) {
  const roots = [discovery.registryPath, ...discovery.gitPaths];
  const paths = [...roots];
  for (const root of roots) {
    if (!lstatSync(root, { throwIfNoEntry: false })?.isDirectory()) continue;
    for (const name of readdirSync(root).sort()) {
      if (root === discovery.registryPath)
        paths.push(...["HEAD", "gitdir", "commondir"].map((file) => join(root, name, file)));
      else paths.push(join(root, name));
    }
  }
  return paths
    .map((path) => {
      const stat = lstatSync(path, { bigint: true, throwIfNoEntry: false });
      return `${path}:${stat ? `${stat.ino}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}:${stat.mode}` : "missing"}`;
    })
    .join("\n");
}

/**
 * The server owns Git discovery; core consumes the composed read-only port.
 * Git metadata is statted, never file-watched. Known project-file changes reuse
 * divergence results; unhinted brief/lifecycle reads recheck main divergence.
 */
export function createProjectFiles(root: string, main: RepoFiles = createNodeRepoFiles(root)) {
  let discovery: ReturnType<typeof listWorkItemWorktrees> | undefined;
  let discoveryWarnings: Warning[] = [];
  let metadataVersion: string | undefined;
  const bases = new Map<string, string>();
  const divergence = new Map<string, Warning | null>();
  function metadataChanged() {
    if (!discovery) return false;
    try {
      return (
        [...discovery.worktrees.values()].some(({ path }) => !worktreeExists(path)) ||
        gitMetadataVersion(discovery) !== metadataVersion
      );
    } catch {
      return true;
    }
  }
  const read = (changedPaths?: readonly string[]) => {
    if (!discovery || discoveryWarnings.length > 0 || metadataChanged()) {
      bases.clear();
      divergence.clear();
      try {
        const before = discovery ? gitMetadataVersion(discovery) : undefined;
        discovery = listWorkItemWorktrees(root);
        metadataVersion = before ?? gitMetadataVersion(discovery);
        discoveryWarnings = [];
      } catch (error) {
        if (discovery) discovery = { ...discovery, worktrees: new Map() };
        discoveryWarnings = [
          { path: ".git", message: `Cannot discover worktrees: ${String(error)}` },
        ];
      }
    }
    const warnings = [...discoveryWarnings];
    const overlays = new Map<string, RepoFiles>();
    const worktreePaths = new Map<string, string>();
    const watchPaths = projectPaths.map((path) => join(root, path));
    if (discovery) {
      for (const [slug, worktree] of discovery.worktrees) {
        overlays.set(slug, createNodeRepoFiles(worktree.path));
        worktreePaths.set(slug, worktree.path);
        watchPaths.push(join(worktree.path, ".scratch", slug));
        const mainScope = join(root, ".scratch", slug);
        if (
          !divergence.has(slug) ||
          changedPaths === undefined ||
          changedPaths?.some((path) => within(path, mainScope) || within(mainScope, path))
        ) {
          try {
            const base = bases.get(slug) ?? workItemBaseCommit(root, slug);
            bases.set(slug, base);
            divergence.set(
              slug,
              workItemFilesDiverged(root, slug, base)
                ? {
                    path: `.scratch/${slug}/`,
                    message: `The main checkout's work item files differ from the worktree's base commit. Edit ${join(worktree.path, ".scratch", slug)} instead.`,
                  }
                : null,
            );
          } catch (error) {
            divergence.set(slug, {
              path: `.scratch/${slug}/`,
              message: `Cannot check divergence: ${String(error)}`,
            });
          }
        }
        const warning = divergence.get(slug);
        if (warning) warnings.push(warning);
      }
    }
    return { files: composeWorkItemFiles(main, overlays), worktreePaths, watchPaths, warnings };
  };
  return Object.assign(read, { metadataChanged });
}

export type ProjectFilesReader = ReturnType<typeof createProjectFiles>;
