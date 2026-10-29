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
  historyKey,
}: {
  directory: string;
  root: string;
  path: string;
  stage: string;
  approval: { at: string; commit: string };
  matchesExtra?: (doc: ReturnType<typeof parseDocument>) => boolean;
  checkoutText?: () => string | undefined;
  historyKey?: readonly string[];
}): boolean {
  const key = JSON.stringify([
    directory,
    root,
    path,
    stage,
    approval.at,
    approval.commit,
    historyKey,
    ...(!matchesExtra && historyKey && checkoutText ? [checkoutText()] : []),
  ]);
  if (!matchesExtra && historyKey && localCache.has(key)) return localCache.get(key) as boolean;
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
      const parent = execFileSync("git", ["show", "-s", "--format=%P", introduced], {
        cwd,
        encoding: "utf8",
      })
        .trim()
        .split(" ")[0];
      if (!parent) throw new Error("Approval introducing commit has no parent");
      if (matches(readVersion(parent))) continue;
      if (allowCheckout && matches(checkoutText?.()))
        return checkHistory(root, false) ?? parent !== approval.commit;
      return parent !== approval.commit;
    }
    if (allowCheckout && matches(checkoutText?.())) return checkHistory(root, false);
    return undefined;
  };
  const result = checkHistory(directory, !!checkoutText);
  if (!matchesExtra && historyKey && result !== undefined) localCache.set(key, result);
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
    let historyKey: string[];
    try {
      historyKey = (directory === root ? [directory] : [directory, root]).map((cwd) =>
        execFileSync("git", ["log", "-1", "--format=%H", "--", path], {
          cwd,
          encoding: "utf8",
        }).trim(),
      );
    } catch {
      continue;
    }
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
      try {
        if (
          approvalHeadChanged({
            directory,
            root,
            path,
            stage,
            approval: { at: approval.at, commit: approval.commit },
            checkoutText:
              directory !== root ? () => createNodeRepoFiles(root).read(path) : undefined,
            historyKey,
          })
        )
          record.approved = { ...approval, state: "stale", stateReason: "head-changed" };
      } catch {
        // Leave this approval unchanged if its history cannot be read.
      }
    }
  }
}
