import { parseDocument } from "yaml";
import { bundledWorkflowYaml } from "./bundled-workflows.js";
import type { RepoFiles, Warning } from "./work-items.js";

export type WorkflowId = string;
export type BoardColumn = "clarify" | "spec" | "tickets" | "implement" | "review" | "ship";
export type StageId = string;
type BuiltInStageId = BoardColumn | "diagnose" | "fix" | "do";
export type GateKind = "manual" | "spec" | "tickets" | "evidence" | "merge";
export type WorkflowStage = {
  id: StageId;
  name: string;
  column: BoardColumn;
  skill: string | null;
  gate: GateKind;
  agent?: string;
};
export type WorkflowDefinition = {
  id: WorkflowId;
  name: string;
  defaultAgent: string;
  stages: readonly WorkflowStage[];
};
export type WorkflowDefinitions = Record<WorkflowId, WorkflowDefinition>;
export type WorkflowIndex = {
  workflows: WorkflowDefinitions;
  warnings: Warning[];
  fallbackIds: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseWorkflowDefinition(text: string): WorkflowDefinition {
  if (/[\p{Cc}\uFFFD]/u.test(text.replace(/[\t\r\n]/g, "")))
    throw new Error("File contains binary or invalid text");
  const document = parseDocument(text);
  const problems = [...document.errors, ...document.warnings];
  if (problems.length) throw new Error(problems.map(({ message }) => message).join("; "));
  const data: unknown = document.toJS();
  if (!isRecord(data) || !nonempty(data.id) || !nonempty(data.name) || !nonempty(data.defaultAgent))
    throw new Error("Expected id, name and defaultAgent as nonempty strings");
  if (!Array.isArray(data.stages) || data.stages.length === 0)
    throw new Error("Stages must be a nonempty ordered list");
  const ids = new Set<string>();
  const stages = data.stages.map((stage): WorkflowStage => {
    if (!isRecord(stage) || !nonempty(stage.id) || !nonempty(stage.name))
      throw new Error("Every stage needs a nonempty id and name");
    if (ids.has(stage.id)) throw new Error(`Duplicate stage id: ${stage.id}`);
    ids.add(stage.id);
    if (
      typeof stage.column !== "string" ||
      !["clarify", "spec", "tickets", "implement", "review", "ship"].includes(stage.column)
    )
      throw new Error(`Unknown board column: ${stage.column}`);
    if (
      typeof stage.gate !== "string" ||
      !["manual", "spec", "tickets", "evidence", "merge"].includes(stage.gate)
    )
      throw new Error(`Unknown gate kind: ${stage.gate}`);
    if (stage.skill !== null && (typeof stage.skill !== "string" || !/^\/\S+$/.test(stage.skill)))
      throw new Error("Stage skill must be a slash command or null");
    if (stage.agent !== undefined && !nonempty(stage.agent))
      throw new Error("Stage agent must be a nonempty string");
    return {
      id: stage.id,
      name: stage.name,
      column: stage.column as BoardColumn,
      skill: stage.skill,
      gate: stage.gate as GateKind,
      ...(stage.agent === undefined ? {} : { agent: stage.agent }),
    };
  });
  const last = stages.at(-1);
  if (last?.gate !== "merge" || last.column !== "ship")
    throw new Error("The last stage must have a merge gate in the ship column");
  return { id: data.id, name: data.name, defaultAgent: data.defaultAgent, stages };
}

export const builtInWorkflows = Object.fromEntries(
  [bundledWorkflowYaml.feature, bundledWorkflowYaml.bug, bundledWorkflowYaml.quick].map((text) => {
    const workflow = parseWorkflowDefinition(text);
    return [workflow.id, workflow];
  }),
) as Record<
  "feature" | "bug" | "quick",
  Omit<WorkflowDefinition, "stages"> & {
    stages: readonly (WorkflowStage & { id: BuiltInStageId })[];
  }
>;

export function loadWorkflows(files: RepoFiles): WorkflowIndex {
  const workflows: WorkflowDefinitions = { ...builtInWorkflows };
  const warnings: Warning[] = [];
  const fallbackIds: string[] = [];
  const prefix = ".stintwork/workflows/";
  let paths: readonly string[];
  try {
    paths = files.list(prefix);
  } catch (error) {
    return {
      workflows,
      fallbackIds,
      warnings: [{ path: prefix, message: `Cannot read workflows: ${String(error)}` }],
    };
  }
  for (const path of [...paths].sort()) {
    if (!/^[^/]+\.yaml$/.test(path.slice(prefix.length))) continue;
    let id: unknown;
    try {
      const text = files.read(path);
      if (typeof text !== "string") throw new Error("File is missing or is not text");
      id = parseDocument(text).get("id");
      const workflow = parseWorkflowDefinition(text);
      Object.defineProperty(workflows, workflow.id, {
        value: workflow,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      const previousFallback = fallbackIds.indexOf(workflow.id);
      if (previousFallback >= 0) fallbackIds.splice(previousFallback, 1);
    } catch (error) {
      const fallbackId = typeof id === "string" ? id : path.slice(prefix.length, -5);
      fallbackIds.push(fallbackId);
      if (Object.hasOwn(builtInWorkflows, fallbackId))
        workflows[fallbackId] = (builtInWorkflows as WorkflowDefinitions)[fallbackId];
      else delete workflows[fallbackId];
      warnings.push({
        path,
        message: `Invalid workflow definition: ${error instanceof Error ? error.message : String(error)}; falling back to the built-in workflow with the same id, or Feature`,
      });
    }
  }
  return { workflows, warnings, fallbackIds };
}
