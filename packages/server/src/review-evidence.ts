import { execFileSync } from "node:child_process";
import { deriveAttentionItems, type ProjectSnapshot } from "@stintwork/core";
import { checkpointChangedPaths } from "@stintwork/git";
import type { createChecks } from "./checks.js";
import { createMemoryProposalReader } from "./memory-proposals.js";
import type { ProjectFilesReader } from "./work-item-files.js";
import { readPullRequestChecks } from "./pull-requests.js";

export function readEvidenceChangedPaths(
  worktree: string,
  headCommit: string,
  commits: readonly string[],
): Record<string, string[] | null> {
  return Object.fromEntries(
    [...new Set(commits)].map((commit) => {
      try {
        return [
          commit,
          commit === headCommit ? [] : checkpointChangedPaths(worktree, commit, headCommit),
        ];
      } catch {
        return [commit, null];
      }
    }),
  );
}

export function createReviewEvidenceReader(root: string, checks: ReturnType<typeof createChecks>) {
  const readMemoryProposals = createMemoryProposalReader(root);
  return (project: ReturnType<ProjectFilesReader>, snapshot: ProjectSnapshot) => {
    readMemoryProposals(project.files, snapshot);
    for (const item of snapshot.workItems) {
      const path = project.worktreePaths.get(item.slug);
      if (path) item.worktreePath = path;
      try {
        Object.assign(item, checks.evidence(item.slug));
        item.checkCommands = checks.commands();
        if (item.pullRequest)
          item.pullRequestChecks = readPullRequestChecks(root, item.pullRequest);
        if (path || item.merged) {
          item.headCommit =
            item.merged?.commit ??
            execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: path,
              encoding: "utf8",
              stdio: ["ignore", "pipe", "pipe"],
            }).trim();
          item.evidenceChangedPaths = readEvidenceChangedPaths(path ?? root, item.headCommit, [
            ...item.stints.flatMap((stint) => (stint.findings ? [stint.findings.commit] : [])),
            ...(item.checks ?? []).map((result) => result.commit),
            ...(item.pullRequestChecks ? [item.pullRequestChecks.headCommit] : []),
          ]);
        }
        const failure = snapshot.warnings.find(
          ({ path: warningPath, message }) =>
            warningPath === `.scratch/${item.slug}/review.yaml` ||
            (message.startsWith("Cannot derive memory proposals:") &&
              item.stints.some(({ id }) => warningPath === `.stintwork/local/stints/${id}.jsonl`)),
        );
        if (failure) throw new Error(failure.message);
      } catch (error) {
        item.reviewEvidenceError = `Cannot read Review evidence: ${String(error)}`;
        snapshot.warnings.push({
          path: `.scratch/${item.slug}/workflow.yaml`,
          message: item.reviewEvidenceError,
        });
      }
    }
    snapshot.attentionItems = deriveAttentionItems(snapshot);
  };
}

export type ReviewEvidenceReader = ReturnType<typeof createReviewEvidenceReader>;
