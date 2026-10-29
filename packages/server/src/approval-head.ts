// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import type { ProjectSnapshot } from "@stintwork/core";
import { parseDocument } from "yaml";
import { createNodeRepoFiles } from "./repo-files.js";
import type { ProjectFilesReader } from "./work-item-files.js";

const localCache = new Map<string, boolean>();

export function approvalHeadChanged({
  directory,
  root,
  path,
  stage,
  approval,
  matchesExtra,
  checkoutText,
}: {
  directory: string;
  root: string;
  path: string;
  stage: string;
  approval: { at: string; commit: string };
  matchesExtra?: (doc: ReturnType<typeof parseDocument>) => boolean;
  checkoutText?: () => string | undefined;
}): boolean {
  const key = JSON.stringify([directory, root, path, stage, approval.at, approval.commit]);
  if (!matchesExtra && localCache.has(key)) return localCache.get(key) as boolean;
  const matches = (text: string | undefined) => {
    if (text === undefined) return false;
    const doc = parseDocument(text);
    if (doc.errors.length || doc.warnings.length) throw new Error("Invalid workflow");
    return (
      doc.getIn(["stages", stage, "approved", "at"]) === approval.at &&
      doc.getIn(["stages", stage, "approved", "commit"]) === approval.commit &&
      (!matchesExtra || matchesExtra(doc))
    );
  };
  const checkHistory = (cwd: string, allowCheckout: boolean): boolean | undefined => {
    const readVersion = (commit: string) =>
      execFileSync("git", ["ls-tree", "--name-only", commit, "--", path], {
        cwd,
        encoding: "utf8",
      }).trim()
        ? execFileSync("git", ["show", `${commit}:${path}`], { cwd, encoding: "utf8" })
        : undefined;
    const commits = execFileSync("git", ["log", "--format=%H", "--", path], {
      cwd,
      encoding: "utf8",
    }).trim();
    for (const introduced of commits ? commits.split("\n") : []) {
      if (!matches(readVersion(introduced))) continue;
      const parent = execFileSync("git", ["rev-parse", `${introduced}^`], {
        cwd,
        encoding: "utf8",
      }).trim();
      if (matches(readVersion(parent))) continue;
      if (allowCheckout && matches(checkoutText?.())) return checkHistory(root, false);
      return parent !== approval.commit;
    }
    return undefined;
  };
  const result = checkHistory(directory, !!checkoutText);
  if (!matchesExtra && result !== undefined) localCache.set(key, result);
  return result ?? false;
}

export function projectLocalApprovals(
  snapshot: ProjectSnapshot,
  root: string,
  project: ReturnType<ProjectFilesReader>,
) {
  for (const item of snapshot.workItems) {
    if (item.github) continue;
    const directory = project.worktreePaths.get(item.slug) ?? root;
    const path = `.scratch/${item.slug}/workflow.yaml`;
    const stale: typeof item.stages = {};
    try {
      for (const [stage, record] of Object.entries(item.stages)) {
        const approval = record.approved;
        if (
          !approval ||
          typeof approval !== "object" ||
          Array.isArray(approval) ||
          !("at" in approval) ||
          typeof approval.at !== "string" ||
          !("commit" in approval) ||
          typeof approval.commit !== "string"
        )
          continue;
        if (
          approvalHeadChanged({
            directory,
            root,
            path,
            stage,
            approval: { at: approval.at, commit: approval.commit },
            checkoutText:
              directory !== root ? () => createNodeRepoFiles(root).read(path) : undefined,
          })
        )
          stale[stage] = {
            ...record,
            approved: { ...approval, state: "stale", stateReason: "head-changed" },
          };
      }
      Object.assign(item.stages, stale);
    } catch {
      // A failed history read must not alter the item's approval records.
    }
  }
}
