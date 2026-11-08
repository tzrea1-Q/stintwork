// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  githubEvidenceJson,
  githubEvidenceJsonV2,
  githubEvidenceJsonV3,
  evidenceStale,
  approvalReopenState,
  type GithubEvidenceInput,
  type ProjectSnapshot,
} from "@stintwork/core";
import { checkpointChangedPaths } from "@stintwork/git";
import { approvalHeadChanged } from "./approval-head.js";
import { createNodeRepoFiles } from "./repo-files.js";
import type { ProjectFilesReader } from "./work-item-files.js";
import {
  GithubReadError,
  validateGithubIdentities,
  type GithubDiscovery,
} from "./github-discovery.js";
import { githubGateIgnoresBody, githubGateIncludesTickets } from "./github-evidence-scope.js";
import { dependencyOnlyIncomplete } from "./github-tickets.js";

export function projectGithubGates(
  snapshot: ProjectSnapshot,
  root: string,
  project: ReturnType<ProjectFilesReader>,
) {
  const labels = new Map(
    ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"].map((role) => [
      role,
      role,
    ]),
  );
  let configured: string;
  let triageReadable = true;
  try {
    configured = project.files.read("docs/agents/triage-labels.md") ?? "";
  } catch {
    configured = "";
    triageReadable = false;
  }
  for (const line of configured.split(/\r?\n/)) {
    const match = /^\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`/.exec(line);
    if (match && labels.has(match[1])) labels.set(match[1], match[2]);
  }
  for (const item of snapshot.workItems) {
    if (!item.github) continue;
    const worktree = item.github.bound ? project.worktreePaths.get(item.slug) : undefined;
    if (worktree && snapshot.github) {
      const path = `.stintwork/github/${snapshot.github.repository.toLowerCase()}/${item.github.number}/workflow.yaml`;
      const main = project.files.read(path);
      const branch = createNodeRepoFiles(worktree).read(path);
      if (main !== undefined && branch !== undefined && main !== branch)
        snapshot.warnings.push({
          path,
          code: "github-workflow-divergence",
          message: "Workflow records differ between the main checkout and worktree.",
        });
    }
    const remote = snapshot.github?.items.find((entry) => entry.id === item.github?.issueId);
    const detail = remote?.detail;
    item.github.dependenciesUnknown = !!(
      remote?.discoveryComplete &&
      !remote.detailFailed &&
      !snapshot.github?.discoveryFailed &&
      !snapshot.github?.stale &&
      detail &&
      !detail.stale &&
      dependencyOnlyIncomplete(detail)
    );
    const valid =
      triageReadable &&
      detail &&
      !detail.stale &&
      detail.tickets.every(
        (ticket) =>
          typeof ticket.id === "string" &&
          Array.isArray(ticket.blockers) &&
          Array.isArray(ticket.commentRecords),
      );
    const stages = snapshot.workflows[item.workflow].stages;
    const digest = (stage: string, version: 1 | 2 | 3, reopen = false) => {
      if (!valid || !remote) return undefined;
      const includeTickets = githubGateIncludesTickets(stages, stage);
      if (!detail.complete && ((!reopen && includeTickets) || !dependencyOnlyIncomplete(detail)))
        return undefined;
      return `sha256:${createHash("sha256")
        .update(
          (version === 1
            ? githubEvidenceJson
            : version === 2
              ? githubEvidenceJsonV2
              : githubEvidenceJsonV3)(
            {
              parentId: remote.id,
              body: detail.spec,
              tickets: detail.tickets,
            } as GithubEvidenceInput,
            includeTickets,
            [...labels.values()],
          ),
        )
        .digest("hex")}`;
    };
    let upstream: "current" | "stale" | "unknown" = "current";
    for (const { id: stage } of stages) {
      const record = item.stages[stage];
      if (!record) {
        if (
          stages.findIndex((entry) => entry.id === stage) <
          stages.findIndex((entry) => entry.id === item.stage)
        )
          upstream = "unknown";
        continue;
      }
      const approval = record.approved;
      if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
        if (
          stages.findIndex((entry) => entry.id === stage) <
          stages.findIndex((entry) => entry.id === item.stage)
        )
          upstream = "unknown";
        continue;
      }
      const evidence =
        "remote" in approval && approval.remote && typeof approval.remote === "object"
          ? approval.remote
          : undefined;
      const current =
        evidence &&
        "version" in evidence &&
        (evidence.version === 1 || evidence.version === 2 || evidence.version === 3)
          ? digest(stage, evidence.version)
          : undefined;
      let state: "current" | "stale" | "unknown" =
        !current ||
        !evidence ||
        !("version" in evidence) ||
        (evidence.version !== 1 && evidence.version !== 2 && evidence.version !== 3) ||
        !("digest" in evidence) ||
        !("parentId" in evidence) ||
        evidence.parentId !== remote?.id
          ? "unknown"
          : githubGateIgnoresBody(stages, stage) || evidence.digest === current
            ? "current"
            : "stale";
      let headChanged = false;
      if (
        "at" in approval &&
        typeof approval.at === "string" &&
        "commit" in approval &&
        typeof approval.commit === "string"
      ) {
        try {
          const directory = worktree ?? root;
          const path = `.stintwork/github/${item.github.repository.toLowerCase()}/${item.github.number}/workflow.yaml`;
          headChanged = approvalHeadChanged({
            directory,
            root,
            path,
            stage,
            approval: { at: approval.at, commit: approval.commit },
            matchesExtra: (doc) =>
              doc.getIn(["stages", stage, "approved", "remote", "digest"]) ===
              (evidence && "digest" in evidence ? evidence.digest : undefined),
            checkoutText: worktree ? () => project.files.read(path) : undefined,
          });
        } catch {
          state = "unknown";
        }
      }
      const reopenState = approvalReopenState(item.stages, stages, stage);
      if (reopenState !== "current") state = reopenState;
      if (upstream !== "current" && state === "current") state = upstream;
      if (headChanged) state = "stale";
      if (state === "current" && stages.find((entry) => entry.id === stage)?.gate === "evidence") {
        try {
          if (!("commit" in approval) || typeof approval.commit !== "string") state = "unknown";
          else {
            const directory =
              (item.github.bound ? project.worktreePaths.get(item.slug) : undefined) ?? root;
            const headCommit = execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: directory,
              encoding: "utf8",
            }).trim();
            const paths =
              approval.commit === headCommit
                ? []
                : checkpointChangedPaths(directory, approval.commit, headCommit);
            if (
              evidenceStale(
                {
                  slug: item.slug,
                  github: item.github,
                  headCommit,
                  evidenceChangedPaths: { [approval.commit]: paths },
                },
                approval.commit,
              )
            )
              state = "stale";
          }
        } catch {
          state = "unknown";
        }
      }
      if (
        evidence &&
        "version" in evidence &&
        evidence.version !== 1 &&
        evidence.version !== 2 &&
        evidence.version !== 3
      )
        state = "unknown";
      record.approved = {
        ...approval,
        remoteState: state,
        ...(headChanged ? { remoteStateReason: "head-changed" } : {}),
      };
      upstream = state;
    }
    const reviewDigest = item.stage ? digest(item.stage, 3) : undefined;
    const reopenDigest =
      item.stage && item.github.dependenciesUnknown ? digest(item.stage, 3, true) : undefined;
    if (reviewDigest || reopenDigest) {
      try {
        const candidate = project.worktreePaths.get(item.slug);
        const path = `.stintwork/github/${item.github.repository.toLowerCase()}/${item.github.number}/workflow.yaml`;
        const directory =
          candidate &&
          (item.github.bound || resolveGithubWorkflow(project, path, candidate) === undefined)
            ? candidate
            : root;
        const reviewHead = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: directory,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }).trim();
        if (reviewDigest) item.github.reviewDigest = reviewDigest;
        if (reopenDigest) item.github.reopenDigest = reopenDigest;
        item.github.reviewHead = reviewHead;
      } catch {
        /* Approval requires a readable HEAD. */
      }
    }
  }
}

export function githubSnapshotFiles(
  project: ReturnType<ProjectFilesReader>,
  github: NonNullable<ProjectSnapshot["github"]>,
) {
  const overrides = new Map<string, string>();
  for (const item of github.items) {
    const worktree = item.bound ? project.worktreePaths.get(`github-${item.number}`) : undefined;
    if (!worktree) continue;
    const path = `.stintwork/github/${github.repository.toLowerCase()}/${item.number}/workflow.yaml`;
    const text = resolveGithubWorkflow(project, path, worktree);
    if (text !== undefined) overrides.set(path, text);
  }
  return {
    ...project.files,
    read: (path: string) => overrides.get(path) ?? project.files.read(path),
  };
}

export function resolveGithubWorkflow(
  project: ReturnType<ProjectFilesReader>,
  path: string,
  worktree?: string,
) {
  return (
    (worktree ? createNodeRepoFiles(worktree).read(path) : undefined) ?? project.files.read(path)
  );
}

export function bindGithubIdentities(
  data: GithubDiscovery,
  project: ReturnType<ProjectFilesReader>,
) {
  const worktreeFiles = new Map<number, ReturnType<typeof createNodeRepoFiles>>();
  const overridden = new Set<string>();
  for (const item of data.items) {
    const worktree = project.worktreePaths.get(`github-${item.number}`);
    if (!worktree) continue;
    const path = `.stintwork/github/${data.repository.toLowerCase()}/${item.number}/workflow.yaml`;
    const source = createNodeRepoFiles(worktree);
    if (source.read(path) !== undefined) {
      worktreeFiles.set(item.number, source);
      overridden.add(path);
    }
  }
  const mainFiles = {
    read: (path: string) => project.files.read(path),
    list: (prefix: string) => project.files.list(prefix).filter((path) => !overridden.has(path)),
  };
  data = validateGithubIdentities(mainFiles, data);
  for (const item of data.items) {
    const source = worktreeFiles.get(item.number);
    if (!source) continue;
    const path = `.stintwork/github/${data.repository.toLowerCase()}/${item.number}/workflow.yaml`;
    const exactFiles = { read: (name: string) => source.read(name), list: () => [path] };
    try {
      const validated = validateGithubIdentities(exactFiles, {
        ...data,
        complete: false,
        items: [item],
      });
      item.bound = validated.items[0].bound;
    } catch {
      item.bound = false;
      data.complete = false;
      data.error = new GithubReadError("identity").message;
      data.errorCode = "identity";
    }
  }
  return data;
}
