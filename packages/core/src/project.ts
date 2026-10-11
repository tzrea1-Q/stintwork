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

export type ProjectSnapshot = {
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
    headCommit?: string;
    checks?: CheckResult[];
    pullRequestChecks?: PullRequestChecks;
    checkExecution?: CheckExecution | null;
    checkCommands?: CheckCommand[];
    evidenceChangedPaths?: Record<string, string[] | null>;
    reviewEvidenceError?: string;
  })[];
  setup: SetupReport;
  warnings: Warning[];
};

export function indexProject(
  files: RepoFiles,
  meta: { name: string; branch?: string; agents?: AgentProfile[] },
): ProjectSnapshot {
  const loaded = loadWorkflows(files);
  const staged = resolveStages(indexWorkItems(files), files, loaded);
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
  const setup = detectSetup(files);
  const stintIndex = indexStints(files);
  const snapshot: ProjectSnapshot = {
    ...meta,
    permissionLevel,
    agents: meta.agents ?? [],
    attentionItems: [],
    workflows: loaded.workflows,
    milestones: roadmap.milestones,
    workItems: staged.workItems.map((item) => {
      const milestone = assigned.assignments.get(item.slug);
      const stints = stintIndex.stints.filter((stint) => stint.workItem === item.slug);
      const reviewPath = `.scratch/${item.slug}/review.yaml`;
      let reviewDecisions: ReviewDecision[] = [];
      try {
        reviewDecisions = parseReviewDecisions(files.read(reviewPath));
      } catch (error) {
        warnings.push({ path: reviewPath, message: String(error) });
      }
      return {
        ...item,
        ...(milestone === undefined ? {} : { milestone }),
        stints: stints.map(summarizeStint),
        activeStint: stints.find((stint) => stint.status === "running") ?? null,
        reviewDecisions,
        memoryProposals: [],
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
