import { assignMilestones, type Milestone, parseRoadmap } from "./roadmap.js";
import { detectSetup, type SetupReport } from "./setup.js";
import { resolveStages, type StagedWorkItem } from "./stages.js";
import { indexStints, type Stint, type StintSummary, summarizeStint } from "./stints.js";
import { indexWorkItems, type RepoFiles, type Warning } from "./work-items.js";
import { builtInWorkflows } from "./workflows.js";
import { deriveAttentionItems, type AttentionItem } from "./attention.js";
import type { AgentProfile } from "./agents.js";
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
  workflows: typeof builtInWorkflows;
  milestones: Milestone[];
  workItems: (StagedWorkItem & {
    milestone?: string;
    stints: StintSummary[];
    activeStint: Stint | null;
    worktreePath?: string;
  })[];
  setup: SetupReport;
  warnings: Warning[];
};

export function indexProject(
  files: RepoFiles,
  meta: { name: string; branch?: string; agents?: AgentProfile[] },
): ProjectSnapshot {
  const staged = resolveStages(indexWorkItems(files), files);
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
    workflows: builtInWorkflows,
    milestones: roadmap.milestones,
    workItems: staged.workItems.map((item) => {
      const milestone = assigned.assignments.get(item.slug);
      const stints = stintIndex.stints.filter((stint) => stint.workItem === item.slug);
      return {
        ...item,
        ...(milestone === undefined ? {} : { milestone }),
        stints: stints.map(summarizeStint),
        activeStint: stints.find((stint) => stint.status === "running") ?? null,
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
