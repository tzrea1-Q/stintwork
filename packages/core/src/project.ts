import { assignMilestones, type Milestone, parseRoadmap } from "./roadmap.js";
import { detectSetup, type SetupReport } from "./setup.js";
import { resolveStages, type StagedWorkItem } from "./stages.js";
import { indexWorkItems, type RepoFiles, type Warning } from "./work-items.js";
import { builtInWorkflows } from "./workflows.js";

export type ProjectSnapshot = {
  name: string;
  branch?: string;
  workflows: typeof builtInWorkflows;
  milestones: Milestone[];
  workItems: (StagedWorkItem & { milestone?: string })[];
  setup: SetupReport;
  warnings: Warning[];
};

export function indexProject(
  files: RepoFiles,
  meta: { name: string; branch?: string },
): ProjectSnapshot {
  const staged = resolveStages(indexWorkItems(files), files);
  const warnings = [...staged.warnings];
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
  return {
    ...meta,
    workflows: builtInWorkflows,
    milestones: roadmap.milestones,
    workItems: staged.workItems.map((item) => {
      const milestone = assigned.assignments.get(item.slug);
      return { ...item, ...(milestone === undefined ? {} : { milestone }) };
    }),
    setup,
    warnings: [...warnings, ...roadmap.warnings, ...assigned.warnings, ...setup.warnings],
  };
}
