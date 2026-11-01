// SPDX-License-Identifier: Apache-2.0
import { indexProject, type ProjectSnapshot } from "@stintwork/core";
import type { ProjectFilesReader } from "./work-item-files.js";
import type { GithubDiscovery } from "./github-discovery.js";
import {
  bindGithubIdentities,
  githubSnapshotFiles,
  projectGithubGates,
} from "./github-snapshot.js";

export function resolveProjectSnapshot(
  project: ReturnType<ProjectFilesReader>,
  getSnapshot?: () => ProjectSnapshot,
) {
  const current = getSnapshot?.();
  if (current?.setup.tracker !== "github-issues" || !current.github)
    return indexProject(project.files, { name: "" });
  let github = structuredClone(current.github);
  try {
    if (github.repositoryId) github = bindGithubIdentities(github as GithubDiscovery, project);
  } catch {
    github = { ...github, items: [], complete: false, errorCode: "identity" };
  }
  const snapshot = indexProject(githubSnapshotFiles(project, github), {
    name: current.name,
    branch: current.branch,
    agents: current.agents,
    github,
  });
  for (const item of snapshot.workItems) {
    const cached = current.workItems.find(({ slug }) => slug === item.slug);
    if (cached)
      Object.assign(item, {
        worktreePath: cached.worktreePath,
        memoryProposals: cached.memoryProposals,
        memoryProposalError: cached.memoryProposalError,
        headCommit: cached.headCommit,
        checks: cached.checks,
        pullRequestChecks: cached.pullRequestChecks,
        checkExecution: cached.checkExecution,
        checkCommands: cached.checkCommands,
        evidenceChangedPaths: cached.evidenceChangedPaths,
        reviewEvidenceError: cached.reviewEvidenceError,
        riskyPaths: cached.riskyPaths,
      });
  }
  projectGithubGates(snapshot, project.root ?? process.cwd(), project);
  return snapshot;
}
