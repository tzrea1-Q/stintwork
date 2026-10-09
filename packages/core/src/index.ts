export type Health = {
  ok: true;
  repo: string;
};

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

export { assignMilestones, parseRoadmap, type Milestone } from "./roadmap.js";
export { detectSetup, type SetupReport } from "./setup.js";
