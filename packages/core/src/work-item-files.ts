import type { RepoFiles } from "./work-items.js";

/** ADR 0009: replace whole work-item folders; shared memory and stint logs stay in main. */
export function composeWorkItemFiles(
  main: RepoFiles,
  worktrees: ReadonlyMap<string, RepoFiles>,
): RepoFiles {
  const overlays = new Map(worktrees);
  function source(path: string) {
    return path.startsWith(".scratch/") ? overlays.get(path.split("/")[1]) : undefined;
  }
  return {
    read: (path) => (source(path) ?? main).read(path),
    list(prefix) {
      const paths = main.list(prefix).filter((path) => !source(path));
      for (const [slug, files] of overlays) {
        const scope = `.scratch/${slug}/`;
        if (scope.startsWith(prefix) || prefix.startsWith(scope))
          paths.push(...files.list(scope).filter((path) => path.startsWith(prefix)));
      }
      return [...new Set(paths)].sort();
    },
  };
}
