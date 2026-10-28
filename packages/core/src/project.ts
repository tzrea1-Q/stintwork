// SPDX-License-Identifier: Apache-2.0
import { assignMilestones, type Milestone, parseRoadmap } from "./roadmap.js";
import { detectSetup, type SetupReport } from "./setup.js";
import { resolveStages, type StagedWorkItem } from "./stages.js";
import { indexStints, type Stint, type StintSummary, summarizeStint } from "./stints.js";
import { indexWorkItems, type RepoFiles, type Warning } from "./work-items.js";
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
  const staged =
    setup.tracker === "github-issues"
      ? {
          warnings: [],
          workItems: (meta.github?.items ?? []).map(
            (item): StagedWorkItem => ({
              slug: `github-${item.number}`,
              title: item.title,
              type: "feature",
              spec: null,
              tickets: [],
              workflow: "feature",
              stage: undefined,
              column: "spec",
              inferred: false,
              stages: {},
            }),
          ),
        }
      : resolveStages(indexWorkItems(files), files, loaded);
  const warnings = [...staged.warnings];
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
      return {
        ...item,
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
                      complete: remote.complete,
                      bound: remote.bound === true,
                    },
                  }
                : {};
            })()
          : {}),
        ...(milestone === undefined ? {} : { milestone }),
        stints: stints.map(summarizeStint),
        activeStint: stints.find((stint) => stint.status === "running") ?? null,
        reviewDecisions,
        memoryProposals: [],
        outputWarnings: staged.warnings.filter(
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
