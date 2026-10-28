// SPDX-License-Identifier: Apache-2.0
import { assignMilestones, type Milestone, parseRoadmap } from "./roadmap.js";
import { detectSetup, type SetupReport } from "./setup.js";
import { readWorkflow, resolveStages, type StagedWorkItem } from "./stages.js";
import { indexStints, type Stint, type StintSummary, summarizeStint } from "./stints.js";
import { indexWorkItems, orderTickets, type RepoFiles, type Warning } from "./work-items.js";
import { loadWorkflows, type WorkflowDefinitions } from "./workflows.js";
import { deriveAttentionItems, type AttentionItem } from "./attention.js";
import type { AgentProfile } from "./agents.js";
import { parseReviewDecisions, type ReviewDecision } from "./review-decisions.js";
import type { MemoryProposalAttentionItem } from "./memory-proposals.js";
import type { CheckExecution, CheckResult } from "./checks.js";
import type { CheckCommand } from "./project-config.js";
import type { PullRequestChecks } from "./pull-requests.js";
import {
  defaultPermissionLevel,
  projectPermissionLevel,
  type PermissionLevel,
} from "./permission-levels.js";
import type { RiskyPath } from "./stints.js";

export type GithubDiscovery = {
  repository: string;
  repositoryId: string;
  items: {
    id: string;
    number: number;
    title: string;
    url: string;
    complete: boolean;
    bound?: boolean;
    provisional?: boolean;
    detailFailed?: boolean;
    detail?: {
      spec: string;
      fetchedAt?: string;
      stale?: boolean;
      comments?: string[];
      complete?: boolean;
      warnings?: string[];
      tickets: {
        id?: string;
        url?: string;
        blockers?: { id: string; number: number; state: string }[];
        commentRecords?: { id: string; body: string }[];
        number: number;
        title: string;
        state: string;
        stateReason: string | null;
        labels: string[];
        body: string;
        comments: string[];
        blockedBy: number[];
        blocked: boolean;
      }[];
    };
  }[];
  scanned: number;
  cursor: string | null;
  complete: boolean;
  pages: { cost: number; remaining: number; resetAt: string }[];
  discardedPages?: { cost: number; remaining: number; resetAt: string }[];
  retryable?: boolean;
  membershipIncomplete?: boolean;
  warnings: string[];
  error?: string;
  errorCode?: string;
  retryAt?: string;
  stale?: boolean;
  discoveryFailed?: boolean;
  verifying?: boolean;
  fetchedAt?: string;
};

export type ProjectSnapshot = {
  github?: GithubDiscovery;
  permissionLevel?: PermissionLevel;
  name: string;
  agents: AgentProfile[];
  attentionItems: AttentionItem[];
  branch?: string;
  workflows: WorkflowDefinitions;
  milestones: Milestone[];
  workItems: (StagedWorkItem & {
    milestone?: string;
    stints: StintSummary[];
    activeStint: Stint | null;
    worktreePath?: string;
    reviewDecisions?: ReviewDecision[];
    memoryProposals?: MemoryProposalAttentionItem[];
    memoryProposalError?: string;
    outputWarnings?: Warning[];
    headCommit?: string;
    checks?: CheckResult[];
    pullRequestChecks?: PullRequestChecks;
    checkExecution?: CheckExecution | null;
    checkCommands?: CheckCommand[];
    evidenceChangedPaths?: Record<string, string[] | null>;
    reviewEvidenceError?: string;
    riskyPaths?: RiskyPath[];
    github?: {
      repository: string;
      repositoryId: string;
      issueId: string;
      number: number;
      url: string;
      complete: boolean;
      bound?: boolean;
      stale?: boolean;
      reviewDigest?: string;
      reviewHead?: string;
    };
  })[];
  setup: SetupReport;
  warnings: Warning[];
};

export function indexProject(
  files: RepoFiles,
  meta: { name: string; branch?: string; agents?: AgentProfile[]; github?: GithubDiscovery },
): ProjectSnapshot {
  const loaded = loadWorkflows(files);
  const setup = detectSetup(files);
  const remoteWarnings: Warning[] = [];
  const roles = ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"];
  let configured = "";
  let triageUnavailable = false;
  if (setup.tracker === "github-issues") {
    try {
      configured = files.read("docs/agents/triage-labels.md") ?? "";
    } catch {
      triageUnavailable = true;
      remoteWarnings.push({
        path: "docs/agents/triage-labels.md",
        message: "Cannot read triage labels",
      });
    }
  }
  const roleLabels = new Map(roles.map((role) => [role, role]));
  for (const line of configured.split(/\r?\n/)) {
    const match = /^\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`/.exec(line);
    if (match && roleLabels.has(match[1])) roleLabels.set(match[1], match[2]);
  }
  const staged =
    setup.tracker === "github-issues"
      ? {
          warnings: [],
          workItems: (meta.github?.items ?? []).map((item): StagedWorkItem => {
            const path = `.stintwork/github/${meta.github?.repository.toLowerCase()}/${item.number}/workflow.yaml`;
            const record = item.bound
              ? readWorkflow(files, path, remoteWarnings, loaded)
              : undefined;
            const workflow = record?.workflow ?? "feature";
            const stage = record?.stage ?? loaded.workflows.feature.stages[0].id;
            return {
              slug: `github-${item.number}`,
              title: item.title,
              type: "feature",
              spec: item.detail?.spec.trim() ? { path: item.url, text: item.detail.spec } : null,
              tickets: orderTickets(
                (item.detail?.tickets ?? []).map((ticket) => {
                  const path = `https://github.com/${meta.github?.repository}/issues/${ticket.number}`;
                  const matching = [...roleLabels]
                    .filter(([, label]) =>
                      ticket.labels.some((value) => value.toLowerCase() === label.toLowerCase()),
                    )
                    .map(([role]) => role);
                  if (ticket.state === "open" && matching.length > 1)
                    remoteWarnings.push({ path, message: "Conflicting triage labels" });
                  const status =
                    ticket.state === "closed"
                      ? ticket.stateReason === "completed"
                        ? "resolved"
                        : ticket.stateReason === "not_planned"
                          ? "cancelled"
                          : "unknown"
                      : ticket.state === "open"
                        ? triageUnavailable || matching.length > 1
                          ? "unknown"
                          : (matching[0] ?? "open")
                        : "unknown";
                  return {
                    ...ticket,
                    slug: `github-${ticket.number}`,
                    status: item.detail?.stale ? "unknown" : status,
                    resolved: status === "resolved" && !item.detail?.stale,
                    blocked: ticket.blocked || !!item.detail?.stale,
                    path,
                  };
                }),
                remoteWarnings,
                true,
              ),
              workflow,
              stage,
              column: loaded.workflows[workflow].stages.find((entry) => entry.id === stage)?.column,
              inferred: false,
              stages: record?.stages ?? {},
              ...(record?.merged ? { merged: record.merged } : {}),
              ...(record?.pullRequest ? { pullRequest: record.pullRequest } : {}),
            };
          }),
        }
      : resolveStages(indexWorkItems(files), files, loaded);
  const warnings = [...staged.warnings, ...remoteWarnings];
  let permissionLevel = defaultPermissionLevel;
  try {
    permissionLevel = projectPermissionLevel(files.read(".stintwork/config"));
  } catch (error) {
    warnings.push({ path: ".stintwork/config", message: String(error) });
  }
  const roadmapPath = ".stintwork/roadmap.md";
  let roadmapText = "";
  try {
    roadmapText = files.read(roadmapPath) ?? "";
  } catch (error) {
    warnings.push({ path: roadmapPath, message: `Cannot read file: ${String(error)}` });
  }
  const roadmap = parseRoadmap(roadmapText);
  const assigned = assignMilestones(staged.workItems, roadmap.milestones);
  const stintIndex = indexStints(files);
  const snapshot: ProjectSnapshot = {
    ...meta,
    permissionLevel,
    agents: meta.agents ?? [],
    attentionItems: [],
    workflows: loaded.workflows,
    milestones: roadmap.milestones,
    workItems: staged.workItems.map((item) => {
      const bound =
        meta.github?.items.find(({ number }) => item.slug === `github-${number}`)?.bound === true;
      const milestone =
        setup.tracker === "github-issues" && !bound
          ? undefined
          : assigned.assignments.get(item.slug);
      const stints =
        setup.tracker === "github-issues" && !bound
          ? []
          : stintIndex.stints.filter((stint) => stint.workItem === item.slug);
      const reviewPath = `.scratch/${item.slug}/review.yaml`;
      let reviewDecisions: ReviewDecision[] = [];
      if (setup.tracker !== "github-issues" || bound) {
        try {
          reviewDecisions = parseReviewDecisions(files.read(reviewPath));
        } catch (error) {
          warnings.push({ path: reviewPath, message: String(error) });
        }
      }
      const activeStint = stints.find((stint) => stint.status === "running") ?? null;
      return {
        ...item,
        ...(setup.tracker === "github-issues" && activeStint?.ticket != null
          ? {
              tickets: item.tickets.map((ticket) =>
                ticket.number === activeStint.ticket &&
                !ticket.resolved &&
                ticket.status !== "cancelled" &&
                ticket.status !== "unknown"
                  ? { ...ticket, status: "in-progress" }
                  : ticket,
              ),
            }
          : {}),
        ...(meta.github && setup.tracker === "github-issues"
          ? (() => {
              const remote = meta.github.items.find(
                ({ number }) => item.slug === `github-${number}`,
              );
              return remote
                ? {
                    github: {
                      repository: meta.github.repository,
                      repositoryId: meta.github.repositoryId,
                      issueId: remote.id,
                      number: remote.number,
                      url: remote.url,
                      complete: remote.complete && !remote.detail?.stale,
                      bound: remote.bound === true,
                      ...(remote.detail?.stale ? { stale: true } : {}),
                    },
                  }
                : {};
            })()
          : {}),
        ...(milestone === undefined ? {} : { milestone }),
        stints: stints.map(summarizeStint),
        activeStint,
        reviewDecisions,
        memoryProposals: [],
        outputWarnings:
          setup.tracker === "github-issues"
            ? (() => {
                const remote = meta.github?.items.find(
                  ({ number }) => item.slug === `github-${number}`,
                );
                const paths = new Set(item.tickets.map(({ path }) => path));
                return [
                  ...(remote?.detail?.warnings ?? []).map((message) => ({
                    path: remote?.url ?? "",
                    message,
                  })),
                  ...remoteWarnings.filter(({ path }) => paths.has(path)),
                ];
              })()
            : staged.warnings.filter(
                ({ path }) =>
                  path === `.scratch/${item.slug}/spec.md` ||
                  path.startsWith(`.scratch/${item.slug}/issues/`),
              ),
      };
    }),
    setup,
    warnings: [
      ...warnings,
      ...roadmap.warnings,
      ...assigned.warnings,
      ...setup.warnings,
      ...stintIndex.warnings,
    ],
  };
  snapshot.attentionItems = deriveAttentionItems(snapshot);
  return snapshot;
}
