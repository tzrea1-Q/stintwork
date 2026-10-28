// SPDX-License-Identifier: Apache-2.0
import { CoreTextError } from "./core-text.js";
import { parseDocument } from "yaml";
import { isPullRequest, type PullRequest, type MergeMethod } from "./pull-requests.js";
import type { RepoFiles, Warning, WorkItem, WorkItemIndex } from "./work-items.js";
import {
  type BoardColumn,
  builtInWorkflows,
  loadWorkflows,
  type StageId,
  type WorkflowId,
  type WorkflowIndex,
  type WorkflowDefinitions,
} from "./workflows.js";

export type StageRecords = Record<string, Record<string, unknown>>;
export type MergeRecord = { at: string; commit: string; pr?: string; method?: MergeMethod };
export function workflowMerge(
  text: string | undefined,
  merged: MergeRecord,
  workflows: WorkflowDefinitions = builtInWorkflows,
  effectiveWorkflow?: WorkflowId,
): string {
  const document = parseDocument(text ?? "");
  const workflow = effectiveWorkflow ?? document.get("workflow");
  const stage =
    typeof workflow === "string" && Object.hasOwn(workflows, workflow)
      ? workflows[workflow].stages.find(({ id }) => id === document.get("stage"))
      : undefined;
  if (document.errors.length || document.warnings.length || stage?.gate !== "merge")
    throw new CoreTextError({ code: "ship.validWorkflowMerge" });
  if (document.get("workflow") !== workflow) document.set("workflow", workflow);
  document.set("merged", merged);
  return document.toString();
}
export type StagedWorkItem = WorkItem & {
  intent?: string;
  workflow: WorkflowId;
  stage: StageId | undefined;
  inferred: boolean;
  column: BoardColumn | undefined;
  stages: StageRecords;
  declaredMilestone?: string;
  merged?: MergeRecord;
  pullRequest?: PullRequest;
};
export type StagedIndex = { workItems: StagedWorkItem[]; warnings: Warning[] };

type DeclaredWorkflow = {
  title?: string;
  intent?: string;
  workflow: WorkflowId;
  stage: StageId;
  stages: StageRecords;
  declaredMilestone?: string;
  merged?: MergeRecord;
  pullRequest?: PullRequest;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readWorkflow(
  files: RepoFiles,
  path: string,
  warnings: Warning[],
  loaded: WorkflowIndex,
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
    if (
      data.title !== undefined &&
      (typeof data.title !== "string" ||
        !data.title.trim() ||
        /[\p{Cc}\u2028\u2029\uFFFD]/u.test(data.title))
    )
      return invalid("Title must be nonempty, single-line text");
    if (
      data.intent !== undefined &&
      (typeof data.intent !== "string" ||
        /[\p{Cc}\uFFFD]/u.test(data.intent.replace(/[\t\r\n]/g, "")))
    )
      return invalid("Intent must be text");
    if (typeof data.workflow !== "string") {
      return invalid("Unknown workflow");
    }
    const fallback = loaded.fallbackIds.includes(data.workflow);
    const definition = Object.hasOwn(loaded.workflows, data.workflow)
      ? loaded.workflows[data.workflow]
      : fallback
        ? loaded.workflows.feature
        : undefined;
    if (!definition) return invalid("Unknown workflow");
    const workflow = definition.id;
    const stage =
      definition.stages.find((stage) => stage.id === data.stage) ??
      (fallback ? definition.stages[0] : undefined);
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
    if (
      data.merged !== undefined &&
      (!isRecord(data.merged) ||
        typeof data.merged.at !== "string" ||
        !Number.isFinite(Date.parse(data.merged.at)) ||
        typeof data.merged.commit !== "string" ||
        !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(data.merged.commit) ||
        (data.merged.pr !== undefined && typeof data.merged.pr !== "string") ||
        (data.merged.method !== undefined &&
          !["merge", "squash", "rebase"].includes(String(data.merged.method))))
    )
      return invalid("Merged must contain a timestamp and commit");
    if (data.pullRequest !== undefined && !isPullRequest(data.pullRequest))
      return invalid("Pull request must contain a GitHub URL, number, repository and branches");
    return {
      workflow,
      ...(data.title === undefined ? {} : { title: (data.title as string).trim() }),
      ...(data.intent === undefined ? {} : { intent: data.intent as string }),
      stage: stage.id,
      stages,
      ...(data.merged === undefined ? {} : { merged: data.merged as MergeRecord }),
      ...(data.pullRequest === undefined ? {} : { pullRequest: data.pullRequest as PullRequest }),
      ...(data.milestone === undefined ? {} : { declaredMilestone: data.milestone as string }),
    };
  } catch (error) {
    return invalid(String(error));
  }
}

export function resolveStages(
  index: WorkItemIndex,
  files: RepoFiles,
  loaded = loadWorkflows(files),
): StagedIndex {
  const warnings = [...index.warnings, ...loaded.warnings];
  const workItems = index.workItems.map((workItem): StagedWorkItem => {
    const declared = readWorkflow(
      files,
      `.scratch/${workItem.slug}/workflow.yaml`,
      warnings,
      loaded,
    );
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
      const definition = loaded.workflows[workflow];
      if (!definition.stages.some((candidate) => candidate.id === stage)) {
        const column = stage === "diagnose" ? "clarify" : stage === "fix" ? "implement" : stage;
        stage =
          definition.stages.find((candidate) => candidate.column === column)?.id ??
          definition.stages[0].id;
      }
    }
    return {
      ...workItem,
      ...(!workItem.spec && declared?.title ? { title: declared.title } : {}),
      ...(declared?.intent === undefined ? {} : { intent: declared.intent }),
      workflow,
      stage,
      inferred: workItem.type !== "effort" && declared === undefined,
      column: loaded.workflows[workflow].stages.find((candidate) => candidate.id === stage)?.column,
      stages: declared?.stages ?? {},
      ...(declared?.merged ? { merged: declared.merged } : {}),
      ...(declared?.pullRequest ? { pullRequest: declared.pullRequest } : {}),
      ...(declared?.declaredMilestone === undefined
        ? {}
        : { declaredMilestone: declared.declaredMilestone }),
    };
  });
  return { workItems, warnings };
}
