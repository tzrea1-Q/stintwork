// SPDX-License-Identifier: Apache-2.0
export type Health = {
  ok: true;
  repo: string;
};
export {
  isFindingContent,
  isReviewFindings,
  type FindingAxis,
  type FindingSeverity,
  type ReviewFinding,
  type ReviewFindings,
} from "./findings.js";
export {
  readProjectConfig,
  defaultCheckCommands,
  type CheckCommand,
  type ProjectConfig,
} from "./project-config.js";
export {
  isCheckExecution,
  latestCheckResults,
  type CheckStatus,
  type CheckResult,
  type CheckExecution,
  type CheckLiveMessage,
  type WorkItemChecks,
} from "./checks.js";
export type {
  AgentAvailability,
  AgentCapabilityProfile,
  AgentPermissionOption,
  AgentProfile,
} from "./agents.js";
export {
  deriveMemoryProposals,
  isProjectMemoryPath,
  type MemoryProposalAttentionItem,
} from "./memory-proposals.js";
export {
  parseReviewDecisions,
  recordReviewDecision,
  type ReviewDecision,
} from "./review-decisions.js";
export { parseReviewDeveloperNotes, recordReviewDeveloperNote } from "./review-decisions.js";
export { agentUnavailableReason } from "./agents.js";
export {
  defaultPermissionLevel,
  isPermissionLevel,
  permissionLevels,
  permissionPolicy,
  permissionPaths,
  projectPermissionLevel,
  updateProjectPermissionLevel,
  type PermissionLevel,
} from "./permission-levels.js";
export { stageAgent, workflowStageAgent } from "./stage-agent.js";
export {
  deriveAttentionItems,
  type AttentionItem,
  type AttentionItemSource,
  type PermissionAttentionItem,
  type LoginRequiredAttentionItem,
  type HandoffUnresolvedAttentionItem,
  type GateAttentionItem,
} from "./attention.js";
export {
  hasUnresolvedHandoff,
  pendingDeveloperNotes,
  type DeveloperNote,
} from "./developer-notes.js";
export { gateReadiness, workflowGate, type GateRecord, type GateWorkItem } from "./gates.js";
export {
  evidenceStale,
  latestReviewStint,
  type EvidenceContext,
  type ReviewGateCondition,
} from "./review-evidence.js";
export type {
  RichStintEvent,
  StintToolContent,
  StintToolFields,
  StintToolUpdate,
} from "./rich-stint-events.js";

export {
  createMemoryRepoFiles,
  indexWorkItems,
  type RepoFiles,
  type Spec,
  type Ticket,
  type Warning,
  type WorkItem,
  type WorkItemIndex,
} from "./work-items.js";

export {
  resolveStages,
  workflowMerge,
  type StageRecords,
  type StagedIndex,
  type StagedWorkItem,
  type MergeRecord,
} from "./stages.js";
export {
  type BoardColumn,
  builtInWorkflows,
  type StageId,
  type WorkflowDefinition,
  type WorkflowId,
  type WorkflowStage,
} from "./workflows.js";
export { assignMilestones, parseRoadmap, type Milestone } from "./roadmap.js";
export { detectSetup, type SetupReport } from "./setup.js";
export { indexProject, type ProjectSnapshot } from "./project.js";
export { composeWorkItemFiles } from "./work-item-files.js";
export { firstStintWorkflow } from "./first-stint-workflow.js";
export {
  applyStintLogEntry,
  foldStintLog,
  indexStints,
  isBriefHandoff,
  isStintEvent,
  isStintLogEntry,
  mergeStintEvent,
  summarizeStint,
  type Stint,
  type StintEvent,
  type StintLogEvent,
  type StintLiveMessage,
  type StintLogEntry,
  type StintStatus,
  type StintSummary,
} from "./stints.js";
export {
  type Brief,
  type BriefHandoff,
  type BriefInput,
  type BriefPointer,
  briefUnavailableReason,
  compileBrief,
} from "./brief.js";
export * from "./pull-requests.js";
