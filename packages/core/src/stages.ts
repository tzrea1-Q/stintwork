import { parseDocument } from "yaml";
import type { RepoFiles, Warning, WorkItem, WorkItemIndex } from "./work-items.js";
import { type BoardColumn, builtInWorkflows, type StageId, type WorkflowId } from "./workflows.js";

export type StageRecords = Record<string, Record<string, unknown>>;
export type StagedWorkItem = WorkItem & {
  workflow: WorkflowId;
  stage: StageId | undefined;
  inferred: boolean;
  column: BoardColumn | undefined;
  stages: StageRecords;
  declaredMilestone?: string;
};
export type StagedIndex = { workItems: StagedWorkItem[]; warnings: Warning[] };

type DeclaredWorkflow = {
  workflow: WorkflowId;
  stage: StageId;
  stages: StageRecords;
  declaredMilestone?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readWorkflow(
  files: RepoFiles,
  path: string,
  warnings: Warning[],
): DeclaredWorkflow | undefined {
  const invalid = (message: string) => {
    warnings.push({
      path,
      message: `Invalid workflow.yaml: ${message}; falling back to inference`,
    });
    return undefined;
  };
  try {
    const text = files.read(path);
    if (text === undefined) return undefined;
    if (typeof text !== "string" || /[\p{Cc}\uFFFD]/u.test(text.replace(/[\t\r\n]/g, ""))) {
      return invalid("File contains binary or invalid text");
    }
    const document = parseDocument(text);
    const problems = [...document.errors, ...document.warnings];
    if (problems.length) return invalid(problems.map((problem) => problem.message).join("; "));
    const data: unknown = document.toJS();
    if (!isRecord(data)) return invalid("Expected a mapping");
    if (typeof data.workflow !== "string" || !Object.hasOwn(builtInWorkflows, data.workflow)) {
      return invalid("Unknown workflow");
    }
    const workflow = data.workflow as WorkflowId;
    const stage = builtInWorkflows[workflow].stages.find((stage) => stage.id === data.stage);
    if (!stage) return invalid(`Stage is not in the ${workflow} workflow`);
    if (
      data.stages !== undefined &&
      (!isRecord(data.stages) || !Object.values(data.stages).every(isRecord))
    ) {
      return invalid("Stages must be a mapping of per-stage records");
    }
    if (
      data.milestone !== undefined &&
      (typeof data.milestone !== "string" || !data.milestone.trim())
    ) {
      return invalid("Milestone must be a nonempty string");
    }
    const stages = JSON.parse(
      JSON.stringify(data.stages ?? {}, (_key, value) => {
        if (
          value instanceof Map ||
          value instanceof Set ||
          typeof value === "bigint" ||
          (typeof value === "number" && !Number.isFinite(value))
        ) {
          throw new Error("Stages must contain JSON-serialisable values");
        }
        return value;
      }),
    ) as StageRecords;
    return {
      workflow,
      stage: stage.id,
      stages,
      ...(data.milestone === undefined ? {} : { declaredMilestone: data.milestone as string }),
    };
  } catch (error) {
    return invalid(String(error));
  }
}

export function resolveStages(index: WorkItemIndex, files: RepoFiles): StagedIndex {
  const warnings = [...index.warnings];
  const workItems = index.workItems.map((workItem): StagedWorkItem => {
    const declared = readWorkflow(files, `.scratch/${workItem.slug}/workflow.yaml`, warnings);
    const workflow =
      declared?.workflow ?? (/^(bug-|fix-|b-)/.test(workItem.slug) ? "bug" : "feature");
    let stage: StageId | undefined;
    if (workItem.type !== "effort") {
      stage = declared?.stage;
      if (stage === undefined) {
        stage = workItem.tickets.length
          ? workItem.tickets.every((ticket) => ticket.resolved)
            ? "review"
            : workflow === "bug"
              ? "fix"
              : "implement"
          : workflow === "bug"
            ? "diagnose"
            : workItem.spec
              ? "spec"
              : "clarify";
      }
    }
    return {
      ...workItem,
      workflow,
      stage,
      inferred: workItem.type !== "effort" && declared === undefined,
      column: builtInWorkflows[workflow].stages.find((candidate) => candidate.id === stage)?.column,
      stages: declared?.stages ?? {},
      ...(declared?.declaredMilestone === undefined
        ? {}
        : { declaredMilestone: declared.declaredMilestone }),
    };
  });
  return { workItems, warnings };
}
