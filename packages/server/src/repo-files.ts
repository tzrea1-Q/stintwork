import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RepoFiles } from "@stintwork/core";

const directories = [".scratch", ".stintwork", "docs/agents", "docs/adr"];
const rootFiles = ["AGENTS.md", "CLAUDE.md", "GLOSSARY.md"];
export const projectPaths = [...directories, ...rootFiles];

export function createNodeRepoFiles(repoRoot: string): RepoFiles {
  const root = resolve(repoRoot);

  function entry(path: string) {
    const parts = path.split("/");
    if (
      path.includes("\\") ||
      path.includes("\0") ||
      parts.some((part) => !part || part === "." || part === "..") ||
      !(
        rootFiles.includes(path) ||
        directories.some((directory) => path === directory || path.startsWith(`${directory}/`))
      )
    ) {
      return undefined;
    }
    let absolute = root;
    for (const [index, part] of parts.entries()) {
      absolute = join(absolute, part);
      const stat = lstatSync(absolute, { throwIfNoEntry: false });
      if (!stat || stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) {
        return undefined;
      }
      if (index === parts.length - 1) return stat;
    }
    return undefined;
  }

  return {
    list(prefix) {
      const paths: string[] = [];
      function visit(path: string) {
        const stat = entry(path);
        if (stat?.isFile()) {
          if (path.startsWith(prefix)) paths.push(path);
        } else if (stat?.isDirectory()) {
          for (const name of readdirSync(join(root, path)).sort()) visit(`${path}/${name}`);
        }
      }
      for (const path of projectPaths) {
        if (path.startsWith(prefix) || prefix.startsWith(`${path}/`)) visit(path);
      }
      return paths.sort();
    },
    read(path) {
      return entry(path)?.isFile() ? readFileSync(join(root, path), "utf8") : undefined;
    },
  };
}
